import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const token = await getToken({ req: req as any });
  const userId = (session?.user as { id?: string })?.id || token?.sub;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { totalVideos, totalCopies } = await req.json();

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "UniqSocial <noreply@uniqsocial.com>",
      to: user.email,
      subject: "Your videos are ready! — UniqSocial",
      html: buildCompletionEmail(totalVideos || 0, totalCopies || 0),
    });
  } catch (err) {
    console.error("Failed to send completion email:", err);
  }

  return NextResponse.json({ sent: true });
}

function buildCompletionEmail(videos: number, copies: number) {
  const copyText = copies !== 1 ? "s" : "";
  const videoText = videos !== 1 ? "s" : "";
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>',
    '<body style="margin:0;padding:0;background-color:#010313;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;">',
    '  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#010313;min-height:100vh;">',
    '    <tr>',
    '      <td align="center" style="padding:40px 20px;">',
    '        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">',
    '          <tr>',
    '            <td align="center" style="padding-bottom:32px;">',
    '              <span style="color:#ffffff;font-size:20px;font-weight:700;">Uniq</span><span style="color:#a78bfa;font-size:20px;font-weight:700;">Social</span>',
    '            </td>',
    '          </tr>',
    '          <tr>',
    '            <td style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:20px;padding:44px 36px;text-align:center;">',
    '              <div style="display:inline-block;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.2);border-radius:50%;width:56px;height:56px;line-height:56px;margin-bottom:16px;">',
    '                <span style="color:#22c55e;font-size:28px;">&#10003;</span>',
    '              </div>',
    '              <h1 style="margin:0 0 8px;color:#ffffff;font-size:24px;font-weight:700;">Your videos are ready!</h1>',
    '              <p style="margin:0 0 24px;color:#64748b;font-size:14px;">',
    '                ' + copies + ' unique clip' + copyText + ' from ' + videos + ' video' + videoText + ' — ready to download.',
    '              </p>',
    '              <a href="https://uniqsocial.com/dashboard" style="display:inline-block;background:#7c3aed;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:14px 40px;border-radius:12px;">',
    '                Open Dashboard &rarr;',
    '              </a>',
    '            </td>',
    '          </tr>',
    '        </table>',
    '      </td>',
    '    </tr>',
    '  </table>',
    '</body>',
    '</html>',
  ].join('\n');
}
