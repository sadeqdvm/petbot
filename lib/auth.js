import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { connectDb } from "@/lib/db";
import User from "@/models/User";

export const SESSION_COOKIE = "petbot_session";
const encoder = new TextEncoder();

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters");
  }
  return encoder.encode(secret);
}

export async function signSession(user) {
  return new SignJWT({ sub: String(user._id), email: user.email, name: user.name, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(getSecret());
}

export async function verifySessionToken(token) {
  if (!token) return null;
  const { payload } = await jwtVerify(token, getSecret());
  return payload;
}

export async function getSession() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    return await verifySessionToken(token);
  } catch (error) {
    return null;
  }
}

export async function requireSession() {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }
  return session;
}

export function setSessionCookie(token) {
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12
  });
}

export function clearSessionCookie() {
  cookies().delete(SESSION_COOKIE);
}

export async function authenticate(email, password) {
  await connectDb();
  const normalizedEmail = email.trim().toLowerCase();
  let user = await User.findOne({ email: normalizedEmail });

  if (!user && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD && normalizedEmail === process.env.ADMIN_EMAIL.toLowerCase()) {
    const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
    user = await User.create({
      name: process.env.ADMIN_NAME || "Clinic Admin",
      email: normalizedEmail,
      passwordHash,
      role: "admin"
    });
  }

  if (!user) return null;
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;

  user.online = true;
  user.lastSeenAt = new Date();
  await user.save();
  return user;
}
