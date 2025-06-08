import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";

// Send a friend request
export const sendFriendRequest = mutation({
  args: { 
    toUsername: v.string(), 
    userToken: v.string() 
  },
  handler: async (ctx, { toUsername, userToken }) => {
    try {
      // Validate sending user
      const fromUser = await ctx.db
        .query("users")
        .withIndex("by_token", (q) => q.eq("token", userToken))
        .first();

      if (!fromUser) {
        return { success: false, error: "Invalid user token" };
      }

      // Find target user
      const toUser = await ctx.db
        .query("users")
        .withIndex("by_username", (q) => q.eq("username", toUsername))
        .first();

      if (!toUser) {
        return { success: false, error: "User not found" };
      }

      if (fromUser._id === toUser._id) {
        return { success: false, error: "Cannot send friend request to yourself" };
      }

      // Check if they're already friends
      const existingFriendship = await ctx.db
        .query("friendships")
        .withIndex("by_users", (q) => q.eq("user1Id", fromUser._id).eq("user2Id", toUser._id))
        .first() || await ctx.db
        .query("friendships")
        .withIndex("by_users", (q) => q.eq("user1Id", toUser._id).eq("user2Id", fromUser._id))
        .first();

      if (existingFriendship) {
        return { success: false, error: "Already friends with this user" };
      }

      // Check if friend request already exists
      const existingRequest = await ctx.db
        .query("friendRequests")
        .withIndex("by_users", (q) => q.eq("fromUserId", fromUser._id).eq("toUserId", toUser._id))
        .first() || await ctx.db
        .query("friendRequests")
        .withIndex("by_users", (q) => q.eq("fromUserId", toUser._id).eq("toUserId", fromUser._id))
        .first();

      if (existingRequest) {
        if (existingRequest.status === "pending") {
          return { success: false, error: "Friend request already exists" };
        }
      }

      // Create friend request
      const requestId = await ctx.db.insert("friendRequests", {
        fromUserId: fromUser._id,
        toUserId: toUser._id,
        status: "pending",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      return { success: true, requestId, toUsername };
    } catch (error) {
      // Only throw for actual unexpected errors
      throw new ConvexError("Internal server error");
    }
  },
});

// Respond to a friend request
export const respondToFriendRequest = mutation({
  args: { 
    requestId: v.id("friendRequests"), 
    response: v.union(v.literal("accepted"), v.literal("rejected")),
    userToken: v.string() 
  },
  handler: async (ctx, { requestId, response, userToken }) => {
    // Validate user
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("token", userToken))
      .first();

    if (!user) {
      throw new ConvexError("Invalid user token");
    }

    // Get friend request
    const request = await ctx.db.get(requestId);
    if (!request) {
      throw new ConvexError("Friend request not found");
    }

    // Verify this user is the recipient
    if (request.toUserId !== user._id) {
      throw new ConvexError("Unauthorized: This friend request is not for you");
    }

    if (request.status !== "pending") {
      throw new ConvexError("Friend request already responded to");
    }

    // Update request status
    await ctx.db.patch(requestId, {
      status: response,
      updatedAt: Date.now(),
    });

    // If accepted, create friendship
    if (response === "accepted") {
      // Ensure consistent ordering (lower ID first)
      const user1Id = request.fromUserId < request.toUserId ? request.fromUserId : request.toUserId;
      const user2Id = request.fromUserId < request.toUserId ? request.toUserId : request.fromUserId;

      await ctx.db.insert("friendships", {
        user1Id,
        user2Id,
        createdAt: Date.now(),
      });
    }

    return { success: true, response };
  },
});

// Get pending friend requests (received)
export const getPendingFriendRequests = query({
  args: { userToken: v.string() },
  handler: async (ctx, { userToken }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("token", userToken))
      .first();

    if (!user) {
      throw new ConvexError("Invalid user token");
    }

    const requests = await ctx.db
      .query("friendRequests")
      .withIndex("by_toUserId", (q) => q.eq("toUserId", user._id).eq("status", "pending"))
      .collect();

    const requestsWithUsers = await Promise.all(
      requests.map(async (request) => {
        const fromUser = await ctx.db.get(request.fromUserId);
        return {
          requestId: request._id,
          fromUsername: fromUser?.username || "Unknown",
          fromUserId: request.fromUserId,
          createdAt: request.createdAt,
        };
      })
    );

    return requestsWithUsers;
  },
});

// Get sent friend requests
export const getSentFriendRequests = query({
  args: { userToken: v.string() },
  handler: async (ctx, { userToken }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("token", userToken))
      .first();

    if (!user) {
      throw new ConvexError("Invalid user token");
    }

    const requests = await ctx.db
      .query("friendRequests")
      .withIndex("by_fromUserId", (q) => q.eq("fromUserId", user._id).eq("status", "pending"))
      .collect();

    const requestsWithUsers = await Promise.all(
      requests.map(async (request) => {
        const toUser = await ctx.db.get(request.toUserId);
        return {
          requestId: request._id,
          toUsername: toUser?.username || "Unknown",
          toUserId: request.toUserId,
          createdAt: request.createdAt,
        };
      })
    );

    return requestsWithUsers;
  },
});

// Get friends list
export const getFriends = query({
  args: { userToken: v.string() },
  handler: async (ctx, { userToken }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("token", userToken))
      .first();

    if (!user) {
      throw new ConvexError("Invalid user token");
    }

    // Get friendships where user is either user1 or user2
    const friendships1 = await ctx.db
      .query("friendships")
      .withIndex("by_user1", (q) => q.eq("user1Id", user._id))
      .collect();

    const friendships2 = await ctx.db
      .query("friendships")
      .withIndex("by_user2", (q) => q.eq("user2Id", user._id))
      .collect();

    const allFriendships = [...friendships1, ...friendships2];

    const friends = await Promise.all(
      allFriendships.map(async (friendship) => {
        const friendId = friendship.user1Id === user._id ? friendship.user2Id : friendship.user1Id;
        const friend = await ctx.db.get(friendId);
        
        if (!friend) return null;

        // Get their active sessions for online status
        const activeSessions = await ctx.db
          .query("sessions")
          .withIndex("by_userId", (q) => q.eq("userId", friendId))
          .filter((q) => q.and(
            q.eq(q.field("isActive"), true),
            q.gt(q.field("lastPing"), Date.now() - (60 * 60 * 1000)) // Last hour
          ))
          .collect();

        return {
          userId: friendId,
          username: friend.username,
          isOnline: activeSessions.length > 0,
          sessionCount: activeSessions.length,
          friendsSince: friendship.createdAt,
        };
      })
    );

    return friends.filter(Boolean);
  },
});

// Remove friend
export const removeFriend = mutation({
  args: { 
    friendUserId: v.id("users"), 
    userToken: v.string() 
  },
  handler: async (ctx, { friendUserId, userToken }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("token", userToken))
      .first();

    if (!user) {
      throw new ConvexError("Invalid user token");
    }

    // Find the friendship (check both orderings)
    const friendship = await ctx.db
      .query("friendships")
      .withIndex("by_users", (q) => q.eq("user1Id", user._id).eq("user2Id", friendUserId))
      .first() || await ctx.db
      .query("friendships")
      .withIndex("by_users", (q) => q.eq("user1Id", friendUserId).eq("user2Id", user._id))
      .first();

    if (!friendship) {
      throw new ConvexError("Friendship not found");
    }

    await ctx.db.delete(friendship._id);
    return { success: true };
  },
});

// Get friend request count (for notifications)
export const getFriendRequestCount = query({
  args: { userToken: v.string() },
  handler: async (ctx, { userToken }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("token", userToken))
      .first();

    if (!user) {
      return 0;
    }

    const pendingRequests = await ctx.db
      .query("friendRequests")
      .withIndex("by_toUserId", (q) => q.eq("toUserId", user._id).eq("status", "pending"))
      .collect();

    return pendingRequests.length;
  },
});

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

// Get active sessions for a friend (with friendship verification and server-side ping cleanup)
export const getFriendActiveSessions = mutation({
  args: { 
    friendUserId: v.id("users"),
    userToken: v.string(),
    performActivePing: v.optional(v.boolean()) // New parameter to control active pinging
  },
  handler: async (ctx, { friendUserId, userToken, performActivePing = false }) => {
    // Validate requesting user
    const requestingUser = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("token", userToken))
      .first();

    if (!requestingUser) {
      throw new ConvexError("Invalid user token");
    }

    // Verify friendship
    const areFriends = await verifyFriendship(ctx, requestingUser._id, friendUserId);
    if (!areFriends) {
      throw new ConvexError("You are not friends with this user");
    }

    // Get friend user details
    const friendUser = await ctx.db.get(friendUserId);
    if (!friendUser) {
      throw new ConvexError("Friend user not found");
    }

    // Get all sessions for the friend (within last hour)
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_userId", (q) => q.eq("userId", friendUserId))
      .filter((q) => q.and(
        q.eq(q.field("isActive"), true),
        q.gt(q.field("lastPing"), oneHourAgo)
      ))
      .collect();

    const activeSessions = [];
    
    if (performActivePing) {
      // Active ping mode: Send ping requests to trigger session responses
      console.log(`Sending ping requests to ${sessions.length} sessions`);
      
      const thirtySecondsAgo = Date.now() - (30 * 1000);
      
      for (const session of sessions) {
        try {
          // Create a ping request to this session to trigger a response
          await ctx.db.insert("pingRequests", {
            fromSessionId: "server-health-check", // Special identifier for server health checks
            toSessionId: session.sessionId,
            fromUserId: requestingUser._id,
            toUserId: friendUserId,
            status: "pending",
            requestData: { 
              type: "session_health_check", 
              timestamp: Date.now(),
              requester: requestingUser.username 
            },
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });

          // Check if session has pinged recently (within last 30 seconds)
          if (session.lastPing > thirtySecondsAgo) {
            activeSessions.push({
              sessionId: session.sessionId,
              lastPing: session.lastPing,
              createdAt: session.createdAt,
              timeSinceLastPing: Date.now() - session.lastPing,
              pingStatus: "recently_active",
            });
          } else {
            // Session hasn't been active recently, mark as inactive
            await ctx.db.patch(session._id, {
              isActive: false,
              updatedAt: Date.now(),
            });
            console.log(`Marked inactive session: ${session.sessionId} (no recent activity)`);
          }
          
        } catch (error) {
          console.error(`Error processing session ${session.sessionId}:`, error);
          // If there's an error, mark session as inactive
          await ctx.db.patch(session._id, {
            isActive: false,
            updatedAt: Date.now(),
          });
        }
      }
    } else {
      // Passive mode: Just check last ping times (original behavior)
      const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
      
      for (const session of sessions) {
        // If session hasn't pinged in the last 5 minutes, consider it potentially inactive
        if (session.lastPing < fiveMinutesAgo) {
          // Mark session as inactive
          await ctx.db.patch(session._id, {
            isActive: false,
            updatedAt: Date.now(),
          });
          console.log(`Cleaned up inactive session: ${session.sessionId}`);
        } else {
          // Session is active
          activeSessions.push({
            sessionId: session.sessionId,
            lastPing: session.lastPing,
            createdAt: session.createdAt,
            timeSinceLastPing: Date.now() - session.lastPing,
            pingStatus: "recent_activity",
          });
        }
      }
    }

    return {
      friendUsername: friendUser.username,
      friendUserId: friendUserId,
      activeSessions,
      totalSessionsFound: sessions.length,
      activeSessionsCount: activeSessions.length,
      pingMethod: performActivePing ? "active_ping_requests_sent" : "passive_check",
      note: performActivePing ? "Ping requests sent to sessions. Sessions should respond automatically." : "Quick check based on recent activity",
    };
  },
});

// Get all friends with their active session counts (for the friend selection UI)
export const getFriendsWithSessionCounts = query({
  args: { userToken: v.string() },
  handler: async (ctx, { userToken }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("token", userToken))
      .first();

    if (!user) {
      throw new ConvexError("Invalid user token");
    }

    // Get friendships where user is either user1 or user2
    const friendships1 = await ctx.db
      .query("friendships")
      .withIndex("by_user1", (q) => q.eq("user1Id", user._id))
      .collect();

    const friendships2 = await ctx.db
      .query("friendships")
      .withIndex("by_user2", (q) => q.eq("user2Id", user._id))
      .collect();

    const allFriendships = [...friendships1, ...friendships2];

    const friends = await Promise.all(
      allFriendships.map(async (friendship) => {
        const friendId = friendship.user1Id === user._id ? friendship.user2Id : friendship.user1Id;
        const friend = await ctx.db.get(friendId);
        
        if (!friend) return null;

        // Get their active sessions (within last 5 minutes for more real-time accuracy)
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
        const activeSessions = await ctx.db
          .query("sessions")
          .withIndex("by_userId", (q) => q.eq("userId", friendId))
          .filter((q) => q.and(
            q.eq(q.field("isActive"), true),
            q.gt(q.field("lastPing"), fiveMinutesAgo)
          ))
          .collect();

        return {
          userId: friendId,
          username: friend.username,
          isOnline: activeSessions.length > 0,
          activeSessionCount: activeSessions.length,
          lastSeen: activeSessions.length > 0 
            ? Math.max(...activeSessions.map(s => s.lastPing))
            : null,
        };
      })
    );

    return friends.filter(Boolean);
  },
});