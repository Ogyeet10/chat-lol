import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";

const getUserByToken = async (ctx: any, token: string) => {
    if (!token) return null;
    return await ctx.db
        .query("users")
        .withIndex("by_token", (q) => q.eq("token", token))
        .first();
};

export const getViewer = query({
    args: { token: v.string() },
    handler: async (ctx, { token }) => {
        const user = await getUserByToken(ctx, token);
        if (user && user.storageId) {
            const imageUrl = await ctx.storage.getUrl(user.storageId);
            return { ...user, imageUrl };
        }
        return user;
    },
});

export const getUserBySessionId = query({
    args: { sessionId: v.string() },
    handler: async (ctx, { sessionId }) => {
        const session = await ctx.db
            .query("sessions")
            .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
            .first();

        if (!session) {
            return null;
        }

        const user = await ctx.db.get(session.userId);

        if (user && user.storageId) {
            const imageUrl = await ctx.storage.getUrl(user.storageId);
            return { ...user, imageUrl };
        }

        return user;
    },
});

export const generateUploadUrl = mutation(async (ctx) => {
  return await ctx.storage.generateUploadUrl();
});

export const updateProfileImage = mutation({
  args: { token: v.string(), storageId: v.id("_storage") },
  handler: async (ctx, { token, storageId }) => {
    const user = await getUserByToken(ctx, token);

    if (!user) {
      throw new Error("User not found or invalid token");
    }

    const imageUrl = await ctx.storage.getUrl(storageId);
    
    await ctx.db.patch(user._id, { storageId, imageUrl });
  },
}); 