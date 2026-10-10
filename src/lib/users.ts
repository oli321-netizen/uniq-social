import bcrypt from "bcryptjs";

export interface User {
  id: string;
  email: string;
  password: string;
  credits: number;
  createdAt: Date;
}

// In-memory store — swap for Prisma + Postgres in production
const users: Map<string, User> = new Map();

export async function createUser(email: string, password: string): Promise<User> {
  const existing = getUserByEmail(email);
  if (existing) throw new Error("Email already registered");

  const hashed = await bcrypt.hash(password, 12);
  const user: User = {
    id: crypto.randomUUID(),
    email: email.toLowerCase().trim(),
    password: hashed,
    credits: 5, // free starter credits
    createdAt: new Date(),
  };
  users.set(user.id, user);
  return user;
}

export function getUserByEmail(email: string): User | undefined {
  const allUsers = Array.from(users.values());
  for (let i = 0; i < allUsers.length; i++) {
    if (allUsers[i].email === email.toLowerCase().trim()) return allUsers[i];
  }
  return undefined;
}

export function getUserById(id: string): User | undefined {
  return users.get(id);
}

export async function verifyPassword(user: User, password: string): Promise<boolean> {
  return bcrypt.compare(password, user.password);
}

export function deductCredits(userId: string, amount: number): boolean {
  const user = users.get(userId);
  if (!user || user.credits < amount) return false;
  user.credits -= amount;
  return true;
}

export function getCredits(userId: string): number {
  return users.get(userId)?.credits ?? 0;
}
