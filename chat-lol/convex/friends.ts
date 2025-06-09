import { mutation, query, action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { api } from "./_generated/api";

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

        // A simple check for recent activity. The detailed check is in getFriendActiveSessions
        const recentSessions = await ctx.db
          .query("sessions")
          .withIndex("by_userId", (q) => q.eq("userId", friendId))
          .filter((q) => q.gt(q.field("lastPing"), Date.now() - 5 * 60 * 1000)) // Active in last 5 mins
          .first();

        return {
          userId: friendId,
          username: friend.username,
          imageUrl: friend.imageUrl,
          isActive: !!recentSessions,
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

// Get active sessions for a specific friend by pinging them.
export const getFriendActiveSessions = action({
  args: { 
    friendUserId: v.id("users"),
    userToken: v.string(),
  },
  handler: async (ctx, { friendUserId, userToken }) => {
    // 1. Get the current user and their active session.
    const user = await ctx.runQuery(api.users.getViewer, { token: userToken });
    if (!user) throw new ConvexError("Invalid user token");

    const currentSession = await ctx.runQuery(internal.sessions._getActiveSessionForUser, { userId: user._id });
    if (!currentSession) {
      // If the current user has no active session, they can't ping.
      return { activeSessions: [] };
    }

    // 2. Get the friend's active sessions.
    const friendSessions = await ctx.runQuery(internal.sessions._getActiveSessionsForUser, { userId: friendUserId });
    if (friendSessions.length === 0) {
      return { activeSessions: [] };
    }

    // 3. Send pings to all of the friend's active sessions.
    const pingPromises = friendSessions.map(session => 
      ctx.runMutation(internal.livePings.send, {
        fromSessionId: currentSession.sessionId,
        toSessionId: session.sessionId,
        userToken,
      }).then(pingId => ({ pingId, session }))
    );
    const pingResults = await Promise.all(pingPromises);
    
    // 4. Wait 3 seconds for responses.
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 5. Check which pings were responded to and clean up stale ones.
    const respondedSessions = await Promise.all(
      pingResults.map(async ({ pingId, session }) => {
        const ping = await ctx.runQuery(api.livePings.get, { pingId });
        
        if (ping && ping.status === 'responded') {
          // It's alive, return the session.
          return session;
        } else {
          // It's stale. Delete the ping and the session document.
          if (ping) {
            await ctx.runMutation(internal.livePings.deletePing, { pingId });
          }
          await ctx.runMutation(internal.sessions.deleteSession, { sessionId: session._id });
          return null;
        }
      })
    );

    // 6. Filter out nulls and format the response.
    const activeSessions = respondedSessions
        .filter((s): s is typeof s & {} => s !== null)
        .map(s => ({
            sessionId: s.sessionId,
        }));

    return { activeSessions };
  }
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