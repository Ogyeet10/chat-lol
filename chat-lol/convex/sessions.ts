import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { ConvexError } from "convex/values";

function generateSessionId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 24; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export const createSession = mutation({
  args: { userToken: v.string() },
  handler: async (ctx, { userToken }) => {
    // Validate user token
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("token", userToken))
      .first();

    if (!user) {
      throw new ConvexError("Invalid user token");
    }

    const sessionId = generateSessionId();
    const now = Date.now();

    const sessionDocId = await ctx.db.insert("sessions", {
      sessionId,
      userId: user._id,
      userToken,
      isActive: true,
      lastPing: now,
      createdAt: now,
      updatedAt: now,
    });

    return { sessionId, sessionDocId };
  },
});

export const updateSessionPing = mutation({
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

    // Find the session
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .first();

    if (!session) {
      throw new ConvexError("Session not found");
    }

    if (session.userToken !== userToken) {
      throw new ConvexError("Session does not belong to this user");
    }

    // Update last ping
    await ctx.db.patch(session._id, {
      lastPing: Date.now(),
      updatedAt: Date.now(),
      isActive: true,
    });

    return { success: true };
  },
});

export const deactivateSession = mutation({
  args: { sessionId: v.string(), userToken: v.string() },
  handler: async (ctx, { sessionId, userToken }) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .first();

    if (!session) {
      return { success: true }; // Already gone
    }

    if (session.userToken !== userToken) {
      throw new ConvexError("Session does not belong to this user");
    }

    await ctx.db.delete(session._id);

    return { success: true };
  },
});

export const getUserSessions = query({
  args: { userToken: v.string() },
  handler: async (ctx, { userToken }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("token", userToken))
      .first();

    if (!user) {
      throw new ConvexError("Invalid user token");
    }

    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    return sessions.map((session) => ({
      sessionId: session.sessionId,
      lastPing: session.lastPing,
      createdAt: session.createdAt,
    }));
  },
});

export const getOtherUserSessions = query({
  args: { username: v.string(), requestingUserToken: v.string() },
  handler: async (ctx, { username, requestingUserToken }) => {
    // Validate requesting user token
    const requestingUser = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("token", requestingUserToken))
      .first();

    if (!requestingUser) {
      throw new ConvexError("Invalid user token");
    }

    // Find target user
    const targetUser = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .first();

    if (!targetUser) {
      throw new ConvexError("User not found");
    }

    // Get active sessions for target user (only recent ones - within last hour)
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_userId", (q) => q.eq("userId", targetUser._id))
      .filter((q) => q.and(
        q.eq(q.field("isActive"), true),
        q.gt(q.field("lastPing"), oneHourAgo)
      ))
      .collect();

    return {
      username: targetUser.username,
      userId: targetUser._id,
      sessions: sessions.map((session) => ({
        sessionId: session.sessionId,
        lastPing: session.lastPing,
        createdAt: session.createdAt,
      })),
    };
  },
});

// Get all active users with their session counts (for discovery)
export const getActiveUsers = query({
  args: { requestingUserToken: v.string() },
  handler: async (ctx, { requestingUserToken }) => {
    // Validate requesting user token
    const requestingUser = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("token", requestingUserToken))
      .first();

    if (!requestingUser) {
      throw new ConvexError("Invalid user token");
    }

    // Get all active sessions from the last hour
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    const activeSessions = await ctx.db
      .query("sessions")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .filter((q) => q.gt(q.field("lastPing"), oneHourAgo))
      .collect();

    // Group sessions by user
    const userSessionMap = new Map();
    
    for (const session of activeSessions) {
      const user = await ctx.db.get(session.userId);
      if (user && user._id !== requestingUser._id) { // Exclude requesting user
        if (!userSessionMap.has(user._id)) {
          userSessionMap.set(user._id, {
            username: user.username,
            userId: user._id,
            sessions: []
          });
        }
        userSessionMap.get(user._id).sessions.push({
          sessionId: session.sessionId,
          lastPing: session.lastPing,
          createdAt: session.createdAt,
        });
      }
    }

    return Array.from(userSessionMap.values());
  },
});

// Cleanup old sessions (can be called periodically)
export const cleanupOldSessions = mutation({
  handler: async (ctx) => {
    const oneHourAgo = Date.now() - (60 * 60 * 1000); // 1 hour ago
    
    const oldSessions = await ctx.db
      .query("sessions")
      .filter((q) => q.lt(q.field("lastPing"), oneHourAgo))
      .collect();

    for (const session of oldSessions) {
      await ctx.db.delete(session._id);
    }

    return { cleanedUp: oldSessions.length };
  },
});

export const deleteSession = internalMutation({
    args: { sessionId: v.id("sessions") },
    handler: async (ctx, { sessionId }) => {
        const session = await ctx.db.get(sessionId);
        if (session) {
            await ctx.db.delete(sessionId);
        }
    }
});

// Internal helper to get a user's active session.
export const _getActiveSessionForUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await ctx.db.query("sessions")
      .withIndex("by_userId", q => q.eq("userId", userId))
      .filter(q => q.eq(q.field("isActive"), true))
      .first();
  }
});

// Internal helper to get all active sessions for a user.
export const _getActiveSessionsForUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("sessions")
      .withIndex("by_userId", q => q.eq("userId", userId))
      .filter(q => q.eq(q.field("isActive"), true))
      .collect();
  }
});