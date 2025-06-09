import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    username: v.string(),
    token: v.string(),
    createdAt: v.number(),
    storageId: v.optional(v.id("_storage")),
    imageUrl: v.optional(v.string()),
  }).index("by_username", ["username"]).index("by_token", ["token"]),

  sessions: defineTable({
    sessionId: v.string(),
    userId: v.id("users"),
    userToken: v.string(),
    isActive: v.boolean(),
    lastPing: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_sessionId", ["sessionId"])
    .index("by_userId", ["userId"])
    .index("by_userToken", ["userToken"])
    .index("by_active", ["isActive", "lastPing"]),

  pingRequests: defineTable({
    fromSessionId: v.string(),
    toSessionId: v.string(),
    fromUserId: v.id("users"),
    toUserId: v.id("users"),
    status: v.union(v.literal("pending"), v.literal("accepted"), v.literal("rejected"), v.literal("expired")),
    requestData: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_toSessionId", ["toSessionId", "status"])
    .index("by_fromSessionId", ["fromSessionId"])
    .index("by_status", ["status", "createdAt"]),

  friendRequests: defineTable({
    fromUserId: v.id("users"),
    toUserId: v.id("users"),
    status: v.union(v.literal("pending"), v.literal("accepted"), v.literal("rejected")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_toUserId", ["toUserId", "status"])
    .index("by_fromUserId", ["fromUserId", "status"])
    .index("by_status", ["status", "createdAt"])
    .index("by_users", ["fromUserId", "toUserId"]),

  friendships: defineTable({
    user1Id: v.id("users"),
    user2Id: v.id("users"),
    createdAt: v.number(),
  }).index("by_user1", ["user1Id"])
    .index("by_user2", ["user2Id"])
    .index("by_users", ["user1Id", "user2Id"]),

  peerConnections: defineTable({
    sessionId: v.string(),
    connectionId: v.string(),
    peerId: v.string(),
    targetSessionId: v.string(),
    status: v.union(v.literal("offered"), v.literal("connected"), v.literal("disconnected")),
    connectionData: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_sessionId", ["sessionId"])
    .index("by_targetSessionId", ["targetSessionId", "status"])
    .index("by_connectionId", ["connectionId"])
    .index("by_peerId", ["peerId"]),

  livePings: defineTable({
    pingerSessionId: v.string(),
    targetSessionId: v.string(),
    status: v.union(v.literal("sent"), v.literal("responded")),
  }).index("by_target", ["targetSessionId", "pingerSessionId"]),

});