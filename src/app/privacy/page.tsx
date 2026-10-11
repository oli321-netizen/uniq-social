import { Fingerprint, ArrowLeft } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Uniq Social",
  description: "Privacy Policy for Uniq Social video processing platform.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#010313]">
      <div className="fixed inset-0 grid-bg opacity-30 pointer-events-none" />

      <header className="border-b border-white/5 bg-[#010313]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <a href="/" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/10 border border-purple-500/20">
              <Fingerprint className="h-3.5 w-3.5 text-purple-400" />
            </div>
            <span className="text-sm font-semibold tracking-tight">
              Uniq<span className="text-purple-400">Social</span>
            </span>
          </a>
          <a
            href="/"
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </a>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-sm text-slate-500 mb-10">Last updated: October 2026</p>

        <div className="space-y-8 text-sm text-slate-300 leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white mb-3">1. Introduction</h2>
            <p>
              Uniq Social (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your information when you use our video processing platform (&quot;Service&quot;).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">2. Information We Collect</h2>
            <p className="mb-3">We collect the following types of information:</p>
            <p className="mb-2">
              <span className="text-white font-medium">Account information:</span> When you register, we collect your name, email address, and password (stored in hashed form).
            </p>
            <p className="mb-2">
              <span className="text-white font-medium">Payment information:</span> Payment details are processed securely by Stripe. We do not store your full card details — we only retain a Stripe customer ID for managing your account.
            </p>
            <p className="mb-2">
              <span className="text-white font-medium">Uploaded content:</span> Videos you upload for processing are stored temporarily to perform the requested transformations.
            </p>
            <p>
              <span className="text-white font-medium">Usage data:</span> We collect basic usage information such as credit usage, processing history, and login activity to maintain and improve the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">3. How We Use Your Information</h2>
            <p>We use your information to:</p>
            <p className="mt-2">
              Provide, maintain, and improve the Service; process your payments and manage your account; send transactional emails (account verification, password resets, payment confirmations); respond to your enquiries and provide support; comply with legal obligations.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">4. Data Retention</h2>
            <p>
              Account data is retained for as long as your account is active. Uploaded videos and processed files are stored temporarily and deleted after a reasonable period. Payment records are retained as required by financial regulations. You may request deletion of your account and associated data at any time by contacting us.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">5. Data Sharing</h2>
            <p>
              We do not sell your personal information. We share data only with trusted third-party service providers necessary to operate the Service:
            </p>
            <p className="mt-2">
              <span className="text-white font-medium">Stripe</span> for payment processing;{" "}
              <span className="text-white font-medium">Railway</span> for application hosting;{" "}
              <span className="text-white font-medium">Resend</span> for transactional email delivery. These providers are contractually obligated to protect your data and use it only for the purposes we specify.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">6. Data Security</h2>
            <p>
              We implement appropriate technical and organisational measures to protect your data, including encrypted connections (HTTPS), hashed passwords, and secure payment processing. However, no method of transmission over the internet is completely secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">7. Cookies</h2>
            <p>
              We use essential cookies required for authentication and session management. We do not use tracking or advertising cookies.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">8. Your Rights</h2>
            <p>
              Under applicable data protection laws (including UK GDPR), you have the right to access, correct, or delete your personal data; object to or restrict processing; request data portability; and withdraw consent where processing is based on consent. To exercise any of these rights, contact us at the email below.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">9. Children</h2>
            <p>
              The Service is not intended for individuals under the age of 18. We do not knowingly collect personal information from children. If you believe a child has provided us with personal data, please contact us so we can take appropriate action.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">10. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. Material changes will be communicated via the email address associated with your account. The &quot;Last updated&quot; date at the top reflects the most recent revision.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">11. Contact</h2>
            <p>
              If you have any questions about this Privacy Policy or wish to exercise your data rights, please contact us at{" "}
              <a href="mailto:support@uniqsocial.com" className="text-purple-400 hover:text-purple-300 transition-colors">
                support@uniqsocial.com
              </a>.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
