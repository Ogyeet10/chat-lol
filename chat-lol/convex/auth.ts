import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";

function generateToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export const checkUsernameAvailable = query({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .first();
    
    return !existingUser;
  },
});

export const signUp = mutation({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    if (!username.trim()) {
      throw new ConvexError("Username cannot be empty");
    }

    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username.trim()))
      .first();

    if (existingUser) {
      throw new ConvexError("Username already taken");
    }

    const token = generateToken();
    
    const userId = await ctx.db.insert("users", {
      username: username.trim(),
      token,
      createdAt: Date.now(),
    });

    return { token, username: username.trim(), userId };
  },
});

export const validateToken = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();
    
    if (!user) {
      return null;
    }

    return { username: user.username, userId: user._id };
  },
});