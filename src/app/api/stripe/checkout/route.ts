import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { authOptions } from "@/lib/auth";
import { stripe, CREDIT_PACKS } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  const rl = rateLimit(`checkout:${ip}`, 60000, 10);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  // Auth check — session first, JWT fallback
  let userId: string | undefined;
  let userEmail: string | undefined;

  const session = await getServerSession(authOptions);
  if (session?.user) {
    userId = (session.user as { id?: string }).id;
    userEmail = session.user.email ?? undefined;
  }

  if (!userId) {
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET || "uniq-social-dev-secret-change-in-prod",
    });
    if (token?.id) {
      userId = token.id as string;
      userEmail = token.email ?? undefined;
    }
  }

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { credits } = await req.json();

  const pack = CREDIT_PACKS.find((p) => p.credits === credits);
  if (!pack) {
    return NextResponse.json({ error: "Invalid credit pack" }, { status: 400 });
  }

  const origin = req.headers.get("origin") || process.env.NEXTAUTH_URL || "https://uniqsocial.com";

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: userEmail,
    metadata: {
      userId,
      credits: String(pack.credits),
    },
    line_items: [
      {
        price_data: {
          currency: "gbp",
          unit_amount: pack.priceInPence,
          product_data: {
            name: pack.label,
            description: `${pack.credits} video processing credits for UniqSocial`,
          },
        },
        quantity: 1,
      },
    ],
    allow_promotion_codes: true,
    success_url: `${origin}/payment-success?credits=${pack.credits}`,
    cancel_url: `${origin}/dashboard`,
  });

  return NextResponse.json({ url: checkoutSession.url });
}
