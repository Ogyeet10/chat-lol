import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";

function generateConnectionId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export const createConnectionOffer = mutation({
  args: { 
    sessionId: v.string(), 
    targetSessionId: v.string(), 
    userToken: v.string(),
    connectionData: v.optional(v.any())
  },
  handler: async (ctx, { sessionId, targetSessionId, userToken, connectionData }) => {
    // Validate user token
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("token", userToken))
      .first();

    if (!user) {
      throw new ConvexError("Invalid user token");
    }

    // Validate source session belongs to user
    const sourceSession = await ctx.db
      .query("sessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .first();

    if (!sourceSession || sourceSession.userToken !== userToken) {
      throw new ConvexError("Session does not belong to this user");
    }

    // Validate target session exists and is active
    const targetSession = await ctx.db
      .query("sessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", targetSessionId))
      .first();

    if (!targetSession || !targetSession.isActive) {
      throw new ConvexError("Target session not found or inactive");
    }

    // Check if there's already an active connection between these sessions
    const existingConnection = await ctx.db
      .query("peerConnections")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .filter((q) => q.and(
        q.eq(q.field("targetSessionId"), targetSessionId),
        q.or(
          q.eq(q.field("status"), "offered"),
          q.eq(q.field("status"), "connected")
        )
      ))
      .first();

    if (existingConnection) {
      throw new ConvexError("Connection already exists or is pending");
    }

    // Generate unique connection ID
    const connectionId = generateConnectionId();
    const peerId = connectionId; // Using connectionId as peerId for simplicity
    const now = Date.now();

    const connectionDocId = await ctx.db.insert("peerConnections", {
      sessionId,
      connectionId,
      peerId,
      targetSessionId,
      status: "offered",
      connectionData: connectionData || {},
      createdAt: now,
      updatedAt: now,
    });

    return { 
      connectionId, 
      peerId,
      connectionDocId,
      targetSession: {
        sessionId: targetSession.sessionId,
        userId: targetSession.userId
      }
    };
  },
});

export const getConnectionOffers = query({
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
      throw new ConvexError("Session does not belong to this user");
    }

    // Get all connection offers targeting this session
    const offers = await ctx.db
      .query("peerConnections")
      .withIndex("by_targetSessionId", (q) => q.eq("targetSessionId", sessionId).eq("status", "offered"))
      .collect();

    // Get session and user info for each offer
    const enrichedOffers = await Promise.all(
      offers.map(async (offer) => {
        const sourceSession = await ctx.db
          .query("sessions")
          .withIndex("by_sessionId", (q) => q.eq("sessionId", offer.sessionId))
          .first();

        let sourceUser = null;
        if (sourceSession) {
          sourceUser = await ctx.db.get(sourceSession.userId);
        }

        return {
          ...offer,
          sourceSession,
          sourceUser: sourceUser ? { 
            username: sourceUser.username, 
            userId: sourceUser._id 
          } : null,
        };
      })
    );

    return enrichedOffers.filter(offer => offer.sourceSession && offer.sourceUser);
  },
});

export const updateConnectionStatus = mutation({
  args: { 
    connectionId: v.string(), 
    status: v.union(v.literal("offered"), v.literal("connected"), v.literal("disconnected")),
    userToken: v.string(),
    connectionData: v.optional(v.any())
  },
  handler: async (ctx, { connectionId, status, userToken, connectionData }) => {
    // Validate user token
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("token", userToken))
      .first();

    if (!user) {
      throw new ConvexError("Invalid user token");
    }

    // Find the connection
    const connection = await ctx.db
      .query("peerConnections")
      .withIndex("by_connectionId", (q) => q.eq("connectionId", connectionId))
      .first();

    if (!connection) {
      throw new ConvexError("Connection not found");
    }

    // Validate user has permission to update this connection
    // Either the user owns the source session or the target session
    const sourceSession = await ctx.db
      .query("sessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", connection.sessionId))
      .first();

    const targetSession = await ctx.db
      .query("sessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", connection.targetSessionId))
      .first();

    const hasPermission = (sourceSession && sourceSession.userToken === userToken) ||
                         (targetSession && targetSession.userToken === userToken);

    if (!hasPermission) {
      throw new ConvexError("Not authorized to update this connection");
    }

    // Update the connection
    await ctx.db.patch(connection._id, {
      status,
      connectionData: connectionData || connection.connectionData,
      updatedAt: Date.now(),
    });

    return { success: true, connectionId, newStatus: status };
  },
});

export const getActiveConnections = query({
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
      throw new ConvexError("Session does not belong to this user");
    }

    // Get all active connections for this session (both outgoing and incoming)
    const outgoingConnections = await ctx.db
      .query("peerConnections")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .filter((q) => q.eq(q.field("status"), "connected"))
      .collect();

    const incomingConnections = await ctx.db
      .query("peerConnections")
      .withIndex("by_targetSessionId", (q) => q.eq("targetSessionId", sessionId).eq("status", "connected"))
      .collect();

    // Enrich with session and user info
    const enrichConnections = async (connections: any[], isOutgoing: boolean) => {
      return Promise.all(
        connections.map(async (conn) => {
          const otherSessionId = isOutgoing ? conn.targetSessionId : conn.sessionId;
          const otherSession = await ctx.db
            .query("sessions")
            .withIndex("by_sessionId", (q) => q.eq("sessionId", otherSessionId))
            .first();

          let otherUser = null;
          if (otherSession) {
            otherUser = await ctx.db.get(otherSession.userId);
          }

          return {
            ...conn,
            isOutgoing,
            otherSessionId,
            otherSession,
            otherUser: otherUser ? {
              username: otherUser.username,
              userId: otherUser._id
            } : null,
          };
        })
      );
    };

    const enrichedOutgoing = await enrichConnections(outgoingConnections, true);
    const enrichedIncoming = await enrichConnections(incomingConnections, false);

    return [...enrichedOutgoing, ...enrichedIncoming].filter(conn => conn.otherUser);
  },
});

export const disconnectConnection = mutation({
  args: { connectionId: v.string(), userToken: v.string() },
  handler: async (ctx, { connectionId, userToken }) => {
    // Validate user token
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("token", userToken))
      .first();

    if (!user) {
      throw new ConvexError("Invalid user token");
    }

    // Find and update the connection
    const connection = await ctx.db
      .query("peerConnections")
      .withIndex("by_connectionId", (q) => q.eq("connectionId", connectionId))
      .first();

    if (!connection) {
      throw new ConvexError("Connection not found");
    }

    // Validate user has permission
    const sourceSession = await ctx.db
      .query("sessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", connection.sessionId))
      .first();

    const targetSession = await ctx.db
      .query("sessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", connection.targetSessionId))
      .first();

    const hasPermission = (sourceSession && sourceSession.userToken === userToken) ||
                         (targetSession && targetSession.userToken === userToken);

    if (!hasPermission) {
      throw new ConvexError("Not authorized to disconnect this connection");
    }

    await ctx.db.patch(connection._id, {
      status: "disconnected",
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

export const cleanupOldConnections = mutation({
  handler: async (ctx) => {
    const oneHourAgo = Date.now() - (60 * 60 * 1000); // 1 hour ago
    
    // Clean up old offered connections (expire after 1 hour)
    const oldOffers = await ctx.db
      .query("peerConnections")
      .filter((q) => q.and(
        q.eq(q.field("status"), "offered"),
        q.lt(q.field("createdAt"), oneHourAgo)
      ))
      .collect();

    for (const offer of oldOffers) {
      await ctx.db.patch(offer._id, {
        status: "disconnected",
        updatedAt: Date.now(),
      });
    }

    // Clean up very old disconnected connections (older than 24 hours)
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    const oldDisconnected = await ctx.db
      .query("peerConnections")
      .filter((q) => q.and(
        q.eq(q.field("status"), "disconnected"),
        q.lt(q.field("updatedAt"), oneDayAgo)
      ))
      .collect();

    for (const oldConn of oldDisconnected) {
      await ctx.db.delete(oldConn._id);
    }

    return { 
      expiredOffers: oldOffers.length,
      deletedOldConnections: oldDisconnected.length
    };
  },
});