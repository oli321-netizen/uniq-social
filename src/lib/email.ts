import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "UniqSocial <noreply@uniqsocial.com>";

export async function sendWelcomeEmail(to: string) {
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: "Welcome to UniqSocial",
      html: buildWelcomeHtml(to),
    });
  } catch (err) {
    console.error("Failed to send welcome email:", err);
    // Don't throw — email failure shouldn't block signup
  }
}

function buildWelcomeHtml(email: string) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to UniqSocial</title>
</head>
<body style="margin:0;padding:0;background-color:#010313;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#010313;min-height:100vh;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:rgba(124,58,237,0.1);border:1px solid rgba(124,58,237,0.2);border-radius:12px;padding:10px 12px;">
                    <span style="color:#a78bfa;font-size:18px;font-weight:700;">&#9670;</span>
                  </td>
                  <td style="padding-left:10px;">
                    <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.5px;">Uniq</span><span style="color:#a78bfa;font-size:20px;font-weight:700;">Social</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main card -->
          <tr>
            <td style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:20px;padding:44px 36px;">

              <!-- Welcome heading -->
              <h1 style="margin:0 0 8px;color:#ffffff;font-size:26px;font-weight:700;text-align:center;line-height:1.3;">
                Welcome to UniqSocial
              </h1>
              <p style="margin:0 0 28px;color:#64748b;font-size:14px;text-align:center;line-height:1.6;">
                Your account is ready. Here&rsquo;s what you need to know.
              </p>

              <!-- Credits badge -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background:rgba(124,58,237,0.08);border:1px solid rgba(124,58,237,0.15);border-radius:14px;padding:20px;text-align:center;">
                    <span style="color:#a78bfa;font-size:36px;font-weight:800;">5</span>
                    <br />
                    <span style="color:#94a3b8;font-size:13px;font-weight:500;">free credits to get started</span>
                  </td>
                </tr>
              </table>

              <!-- Feature list -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="width:28px;vertical-align:top;">
                          <span style="color:#a78bfa;font-size:16px;">&#10003;</span>
                        </td>
                        <td>
                          <span style="color:#ffffff;font-size:14px;font-weight:600;">Randomised Edits</span>
                          <br />
                          <span style="color:#64748b;font-size:12px;">Trim, zoom, mirror, grain &amp; sharpen — every copy unique</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="width:28px;vertical-align:top;">
                          <span style="color:#a78bfa;font-size:16px;">&#10003;</span>
                        </td>
                        <td>
                          <span style="color:#ffffff;font-size:14px;font-weight:600;">Metadata Profiles</span>
                          <br />
                          <span style="color:#64748b;font-size:12px;">Stack multiple device fingerprints for maximum uniqueness</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 0;">
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="width:28px;vertical-align:top;">
                          <span style="color:#a78bfa;font-size:16px;">&#10003;</span>
                        </td>
                        <td>
                          <span style="color:#ffffff;font-size:14px;font-weight:600;">Batch Processing</span>
                          <br />
                          <span style="color:#64748b;font-size:12px;">Generate up to 20 unique copies per upload in one go</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:32px;">
                <tr>
                  <td align="center">
                    <a href="https://uniqsocial.com/dashboard" style="display:inline-block;background:#7c3aed;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:14px 40px;border-radius:12px;letter-spacing:0.3px;">
                      Open Dashboard &rarr;
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:28px;text-align:center;">
              <p style="margin:0 0 6px;color:#334155;font-size:12px;">
                You&rsquo;re receiving this because you signed up at
                <a href="https://uniqsocial.com" style="color:#7c3aed;text-decoration:none;">uniqsocial.com</a>
              </p>
              <p style="margin:0;color:#1e293b;font-size:11px;">
                ${email}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
