import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";

export const sendPingRequest = mutation({
  args: { 
    toSessionId: v.string(), 
    fromSessionId: v.string(),
    userToken: v.string(),
    requestData: v.optional(v.any())
  },
  handler: async (ctx, { toSessionId, fromSessionId, userToken, requestData }) => {
    // Validate requesting user token
    const fromUser = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("token", userToken))
      .first();

    if (!fromUser) {
      throw new ConvexError("Invalid user token");
    }

    // Validate from session belongs to user
    const fromSession = await ctx.db
      .query("sessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", fromSessionId))
      .first();

    if (!fromSession || fromSession.userToken !== userToken) {
      throw new ConvexError("Invalid session");
    }

    // Find target session
    const toSession = await ctx.db
      .query("sessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", toSessionId))
      .first();

    if (!toSession || !toSession.isActive) {
      throw new ConvexError("Target session not found or inactive");
    }

    // Get target user
    const toUser = await ctx.db.get(toSession.userId);
    if (!toUser) {
      throw new ConvexError("Target user not found");
    }

    // Check if there's already a pending request between these sessions
    const existingRequest = await ctx.db
      .query("pingRequests")
      .withIndex("by_toSessionId", (q) => q.eq("toSessionId", toSessionId).eq("status", "pending"))
      .filter((q) => q.eq(q.field("fromSessionId"), fromSessionId))
      .first();

    if (existingRequest) {
      throw new ConvexError("Ping request already pending");
    }

    const now = Date.now();
    const pingRequestId = await ctx.db.insert("pingRequests", {
      fromSessionId,
      toSessionId,
      fromUserId: fromUser._id,
      toUserId: toUser._id,
      status: "pending",
      requestData,
      createdAt: now,
      updatedAt: now,
    });

    return { pingRequestId, success: true };
  },
});

export const respondToPingRequest = mutation({
  args: { 
    pingRequestId: v.id("pingRequests"),
    sessionId: v.string(),
    userToken: v.string(),
    response: v.union(v.literal("accepted"), v.literal("rejected"))
  },
  handler: async (ctx, { pingRequestId, sessionId, userToken, response }) => {
    // Validate user token
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("token", userToken))
      .first();

    if (!user) {
      throw new ConvexError("Invalid user token");
    }

    // Validate session belongs to user
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .first();

    if (!session || session.userToken !== userToken) {
      throw new ConvexError("Invalid session");
    }

    // Get ping request
    const pingRequest = await ctx.db.get(pingRequestId);
    if (!pingRequest) {
      throw new ConvexError("Ping request not found");
    }

    // Verify this session is the target of the ping request
    if (pingRequest.toSessionId !== sessionId) {
      throw new ConvexError("Not authorized to respond to this ping request");
    }

    // Check if request is still pending
    if (pingRequest.status !== "pending") {
      throw new ConvexError("Ping request is no longer pending");
    }

    // Update ping request status
    await ctx.db.patch(pingRequestId, {
      status: response,
      updatedAt: Date.now(),
    });

    return { success: true, response };
  },
});

export const getPendingPingRequests = query({
  args: { sessionId: v.string(), userToken: v.string() },
  handler: async (ctx, { sessionId, userToken }) => {
    // Validate user token
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("token", userToken))
      .first();

    if (!user) {
      throw new ConvexError("Invalid user token");
    }

    // Validate session belongs to user
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .first();

    if (!session || session.userToken !== userToken) {
      throw new ConvexError("Invalid session");
    }

    // Get pending ping requests for this session
    const pendingRequests = await ctx.db
      .query("pingRequests")
      .withIndex("by_toSessionId", (q) => q.eq("toSessionId", sessionId).eq("status", "pending"))
      .collect();

    // Get sender info for each request
    const requestsWithSenderInfo = await Promise.all(
      pendingRequests.map(async (request) => {
        const fromUser = await ctx.db.get(request.fromUserId);
        return {
          ...request,
          fromUsername: fromUser?.username || "Unknown",
        };
      })
    );

    return requestsWithSenderInfo;
  },
});

export const getSentPingRequests = query({
  args: { sessionId: v.string(), userToken: v.string() },
  handler: async (ctx, { sessionId, userToken }) => {
    // Validate user token and session (same as above)
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("token", userToken))
      .first();

    if (!user) {
      throw new ConvexError("Invalid user token");
    }

    const session = await ctx.db
      .query("sessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .first();

    if (!session || session.userToken !== userToken) {
      throw new ConvexError("Invalid session");
    }

    // Get ping requests sent from this session
    const sentRequests = await ctx.db
      .query("pingRequests")
      .withIndex("by_fromSessionId", (q) => q.eq("fromSessionId", sessionId))
      .collect();

    // Get receiver info for each request
    const requestsWithReceiverInfo = await Promise.all(
      sentRequests.map(async (request) => {
        const toUser = await ctx.db.get(request.toUserId);
        return {
          ...request,
          toUsername: toUser?.username || "Unknown",
        };
      })
    );

    return requestsWithReceiverInfo;
  },
});

// Cleanup expired ping requests (older than 5 minutes)
export const cleanupExpiredPingRequests = mutation({
  handler: async (ctx) => {
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    
    const expiredRequests = await ctx.db
      .query("pingRequests")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .filter((q) => q.lt(q.field("createdAt"), fiveMinutesAgo))
      .collect();

    for (const request of expiredRequests) {
      await ctx.db.patch(request._id, {
        status: "expired",
        updatedAt: Date.now(),
      });
    }

    return { expiredCount: expiredRequests.length };
  },
});