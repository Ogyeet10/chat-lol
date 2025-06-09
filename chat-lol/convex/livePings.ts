import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";

// The time in ms after which a ping is considered stale and can be deleted.
const PING_LIFETIME = 30 * 1000; // 30 seconds

// Send a "liveness" ping to another session.
export const send = mutation({
  args: {
    fromSessionId: v.string(),
    toSessionId: v.string(),
    userToken: v.string(),
  },
  handler: async (ctx, { fromSessionId, toSessionId, userToken }) => {
    // Basic validation
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("token", userToken))
      .first();
    if (!user) throw new ConvexError("Invalid user");

    // Clean up any old pings from this pinger to this target to prevent clutter.
    const existingPings = await ctx.db
      .query("livePings")
      .withIndex("by_target", (q) => q.eq("targetSessionId", toSessionId).eq("pingerSessionId", fromSessionId))
      .collect();
    for (const ping of existingPings) {
      await ctx.db.delete(ping._id);
    }
    
    // Create the new ping
    const pingId = await ctx.db.insert("livePings", {
      pingerSessionId: fromSessionId,
      targetSessionId: toSessionId,
      status: "sent",
    });

    return pingId;
  },
});

// Respond to a ping to show we're alive.
export const respond = mutation({
  args: { pingId: v.id("livePings"), userToken: v.string() },
  handler: async (ctx, { pingId, userToken }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("token", userToken))
      .first();
    if (!user) throw new ConvexError("Invalid user");

    const ping = await ctx.db.get(pingId);
    if (ping) {
      await ctx.db.patch(pingId, { status: "responded" });
    }
  },
});

// Get the status of a specific ping.
export const get = query({
  args: { pingId: v.optional(v.id("livePings")) },
  handler: async (ctx, { pingId }) => {
    if (!pingId) return null;
    return await ctx.db.get(pingId);
  },
});

// Find incoming pings for the current session.
export const getIncoming = query({
  args: { targetSessionId: v.string(), userToken: v.string() },
  handler: async (ctx, { targetSessionId, userToken }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("token", userToken))
      .first();
    if (!user) return [];

    return await ctx.db
      .query("livePings")
      .withIndex("by_target", (q) => q.eq("targetSessionId", targetSessionId))
      .filter((q) => q.eq(q.field("status"), "sent"))
      .collect();
  },
});

export const deletePing = internalMutation({
  args: { pingId: v.id("livePings") },
  handler: async (ctx, { pingId }) => {
    const ping = await ctx.db.get(pingId);
    if (ping) {
      await ctx.db.delete(pingId);
    }
  },
});
