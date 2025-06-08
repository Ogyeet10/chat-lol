import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";

// Verify if two users are friends
const verifyFriendship = async (ctx: any, userId1: any, userId2: any): Promise<boolean> => {
  const friendship = await ctx.db
    .query("friendships")
    .withIndex("by_users", (q) => q.eq("user1Id", userId1).eq("user2Id", userId2))
    .first() || await ctx.db
    .query("friendships")
    .withIndex("by_users", (q) => q.eq("user1Id", userId2).eq("user2Id", userId1))
    .first();

  return !!friendship;
};

// Send connection request to a session ID (auto-accepts between friends)
export const sendConnectionRequest = mutation({
  args: {
    toSessionId: v.string(),
    userToken: v.string(),
    offerData: v.any() // WebRTC offer
  },
  handler: async (ctx, { toSessionId, userToken, offerData }) => {
    // Validate requesting user
    const requestingUser = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("token", userToken))
      .first();

    if (!requestingUser) {
      throw new ConvexError("Invalid user token");
    }

    // Get requesting user's session
    const fromSession = await ctx.db
      .query("sessions")
      .withIndex("by_userToken", (q) => q.eq("userToken", userToken))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!fromSession) {
      throw new ConvexError("No active session found for requesting user");
    }

    // Verify target session exists and is active
    const targetSession = await ctx.db
      .query("sessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", toSessionId))
      .first();

    if (!targetSession || !targetSession.isActive) {
      throw new ConvexError("Target session not found or inactive");
    }

    // Get target user
    const targetUser = await ctx.db.get(targetSession.userId);
    if (!targetUser) {
      throw new ConvexError("Target user not found");
    }

    // Verify friendship - only friends can connect
    const areFriends = await verifyFriendship(ctx, requestingUser._id, targetUser._id);
    if (!areFriends) {
      throw new ConvexError("You can only connect to friends");
    }

    // Check if there's already a pending request between these sessions
    const existingRequest = await ctx.db
      .query("connectionRequests")
      .withIndex("by_toSessionId", (q) => q.eq("toSessionId", toSessionId).eq("status", "sent"))
      .filter((q) => q.eq(q.field("fromSessionId"), fromSession.sessionId))
      .first();

    if (existingRequest) {
      throw new ConvexError("Connection request already pending");
    }

    const now = Date.now();
    
    // Create the request with "sent" status
    const requestId = await ctx.db.insert("connectionRequests", {
      toSessionId,
      fromSessionId: fromSession.sessionId,
      fromUsername: requestingUser.username,
      requestData: offerData,
      status: "sent",
      createdAt: now,
      updatedAt: now,
    });

    return { requestId, success: true };
  },
});

// Reply to a connection request with an answer
export const replyToConnectionRequest = mutation({
  args: {
    requestId: v.id("connectionRequests"),
    userToken: v.string(),
    answerData: v.any() // WebRTC answer
  },
  handler: async (ctx, { requestId, userToken, answerData }) => {
    // Validate user and their session
    const user = await ctx.db.query("users").withIndex("by_token", (q) => q.eq("token", userToken)).first();
    if (!user) throw new ConvexError("Invalid user token");
    
    const session = await ctx.db.query("sessions").withIndex("by_userToken", (q) => q.eq("userToken", userToken)).filter((q) => q.eq(q.field("isActive"), true)).first();
    if (!session) throw new ConvexError("No active session found");

    // Get connection request
    const request = await ctx.db.get(requestId);
    if (!request) throw new ConvexError("Connection request not found");

    // Verify this session is the target and the request is in "sent" state
    if (request.toSessionId !== session.sessionId) throw new ConvexError("Not authorized to respond to this request");
    if (request.status !== "sent") throw new ConvexError("Request is not in a 'sent' state.");

    // Update status to "replied" and add the answer data
    await ctx.db.patch(requestId, {
      status: "replied",
      responseData: answerData,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

// Get "sent" connection requests for the current user to process
export const getSentConnectionRequests = query({
  args: { userToken: v.string(), sessionId: v.string() },
  handler: async (ctx, { userToken, sessionId }) => {
    console.log('🔌 SERVER DEBUG: getSentConnectionRequests called for token:', userToken.substring(0, 8) + '...', 'sessionId:', sessionId);
    
    // Validate user
    const user = await ctx.db.query("users").withIndex("by_token", (q) => q.eq("token", userToken)).first();
    if (!user) {
      console.log('🔌 SERVER DEBUG: Invalid user token');
      throw new ConvexError("Invalid user token");
    }
    console.log('🔌 SERVER DEBUG: Found user:', user.username);

    // Use the provided session ID directly instead of looking it up
    console.log('🔌 SERVER DEBUG: Using provided session ID:', sessionId);

    // Get requests targeted at me that are in "sent" status
    console.log('🔌 SERVER DEBUG: Querying requests for session:', sessionId);
    
    // Debug: Get ALL connection requests and filter manually
    const allRequests = await ctx.db
      .query("connectionRequests")
      .collect();
    
    console.log('🔌 SERVER DEBUG: Total connection requests in DB:', allRequests.length);
    
    const sentRequests = allRequests.filter(r => 
      r.toSessionId === sessionId && r.status === "sent"
    );
    
    console.log('🔌 SERVER DEBUG: Requests matching our criteria:', sentRequests.length);

    console.log('🔌 SERVER DEBUG: Found', sentRequests.length, 'requests for session:', sessionId);
    if (sentRequests.length > 0) {
      console.log('🔌 SERVER DEBUG: Request details:', sentRequests.map(r => ({
        id: r._id,
        from: r.fromUsername,
        fromSession: r.fromSessionId,
        status: r.status,
        createdAt: new Date(r.createdAt).toISOString()
      })));
    }

    return sentRequests;
  },
});

// Check for connection request response (for the requesting client)
export const checkConnectionRequestStatus = query({
  args: { 
    requestId: v.id("connectionRequests"),
    userToken: v.string() 
  },
  handler: async (ctx, { requestId, userToken }) => {
    // Validate user
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("token", userToken))
      .first();

    if (!user) {
      throw new ConvexError("Invalid user token");
    }

    // Get user's session
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_userToken", (q) => q.eq("userToken", userToken))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!session) {
      throw new ConvexError("No active session found");
    }

    // Get request
    const request = await ctx.db.get(requestId);
    if (!request) {
      throw new ConvexError("Request not found");
    }

    // Verify this session is involved in the request (either sender or receiver)
    if (request.fromSessionId !== session.sessionId && request.toSessionId !== session.sessionId) {
      throw new ConvexError("Not authorized to check this request");
    }

    return request;
  },
});

// Mark connection as completed (cleanup)
export const markConnectionCompleted = mutation({
  args: {
    requestId: v.id("connectionRequests"),
    userToken: v.string()
  },
  handler: async (ctx, { requestId, userToken }) => {
    // Validate user
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("token", userToken))
      .first();

    if (!user) {
      throw new ConvexError("Invalid user token");
    }

    // Get request
    const request = await ctx.db.get(requestId);
    if (!request) {
      throw new ConvexError("Request not found");
    }

    // Update status
    await ctx.db.patch(requestId, {
      status: "completed",
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

// Cleanup expired requests (older than 5 minutes)
export const cleanupExpiredRequests = mutation({
  handler: async (ctx) => {
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    
    const expiredRequests = await ctx.db
      .query("connectionRequests")
      .withIndex("by_status", (q) => q.eq("status", "sent"))
      .filter((q) => q.lt(q.field("createdAt"), fiveMinutesAgo))
      .collect();

    for (const request of expiredRequests) {
      await ctx.db.delete(request._id);
    }

    return { cleanedUp: expiredRequests.length };
  },
}); 