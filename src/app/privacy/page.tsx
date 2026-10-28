import { Fingerprint } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Privacy Policy | UniqSocial",
  description: "Privacy Policy for UniqSocial video processing platform.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#0a0b14] text-white">
      <nav className="border-b border-white/5 bg-[#0a0b14]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 border border-purple-500/20">
              <Fingerprint className="h-4 w-4 text-purple-400" />
            </div>
            <span className="text-sm font-semibold tracking-tight">
              Uniq<span className="text-purple-400">Social</span>
            </span>
          </Link>
        </div>
      </nav>

      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-16 sm:py-24">
        <h1 className="text-3xl sm:text-4xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-sm text-slate-500 mb-10">Last updated: 12 October 2026</p>

        <div className="space-y-8 text-slate-300 text-[15px] leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white mb-3">1. Introduction</h2>
            <p>
              UniqSocial (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;) is committed to protecting
              your privacy. This Privacy Policy explains how we collect, use, and safeguard your
              information when you use our video processing service at uniqsocial.com.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">2. Information We Collect</h2>
            <p className="font-medium text-white mb-2">Account Information</p>
            <p className="mb-4">
              When you register, we collect your email address and a hashed version of your password.
              We do not store plain-text passwords.
            </p>
            <p className="font-medium text-white mb-2">Payment Information</p>
            <p className="mb-4">
              Payment processing is handled entirely by Stripe. We store your Stripe customer ID
              and subscription details but never store your card numbers or banking information
              directly.
            </p>
            <p className="font-medium text-white mb-2">Usage Data</p>
            <p className="mb-4">
              We log processing jobs (file name, number of copies, status) to provide you with
              usage history and to improve the Service. We also track credit transactions for
              billing transparency.
            </p>
            <p className="font-medium text-white mb-2">Video Content</p>
            <p>
              Videos you upload are processed in real-time on our servers. We do not permanently
              store your uploaded videos or processed outputs. All temporary files are deleted
              immediately after processing is complete.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">3. How We Use Your Information</h2>
            <p>We use your information to:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1.5">
              <li>Provide, maintain, and improve the Service</li>
              <li>Process your payments and manage your subscription</li>
              <li>Send transactional emails (verification codes, password resets, processing notifications)</li>
              <li>Track your credit balance and usage history</li>
              <li>Manage the referral programme</li>
              <li>Respond to your enquiries and support requests</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">4. Data Sharing</h2>
            <p>
              We do not sell, trade, or rent your personal information to third parties. We share
              data only with:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1.5">
              <li><strong className="text-white">Stripe</strong> — for payment processing</li>
              <li><strong className="text-white">Resend</strong> — for transactional email delivery</li>
              <li><strong className="text-white">Railway</strong> — our hosting infrastructure provider</li>
            </ul>
            <p className="mt-3">
              These providers process data solely on our behalf and are contractually obligated to
              protect your information.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">5. Data Security</h2>
            <p>
              We implement industry-standard security measures including encrypted passwords
              (bcrypt hashing), HTTPS encryption for all data in transit, secure API key generation,
              and rate limiting to prevent abuse. However, no method of transmission over the
              internet is 100% secure.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">6. Data Retention</h2>
            <p>
              We retain your account information for as long as your account is active. Processing
              job logs are retained for your usage history. If you delete your account, all
              associated data is permanently removed from our systems, including transaction history,
              processing logs, API keys, and referral records.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">7. Cookies</h2>
            <p>
              We use essential cookies and local storage for authentication session management and
              theme preferences. We do not use tracking cookies or third-party analytics cookies.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">8. Your Rights</h2>
            <p>You have the right to:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1.5">
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Delete your account and all associated data</li>
              <li>Export your transaction and usage history</li>
              <li>Withdraw consent for non-essential data processing</li>
            </ul>
            <p className="mt-3">
              You can exercise most of these rights directly through your account settings.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">9. Children&apos;s Privacy</h2>
            <p>
              The Service is not intended for use by anyone under the age of 18. We do not knowingly
              collect personal information from children. If we become aware that we have collected
              data from a child, we will promptly delete it.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">10. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of any
              material changes by email. Your continued use of the Service after changes become
              effective constitutes acceptance of the revised policy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">11. Contact</h2>
            <p>
              For privacy-related enquiries, please contact us at{" "}
              <a href="mailto:support@uniqsocial.com" className="text-purple-400 hover:text-purple-300 transition-colors">
                support@uniqsocial.com
              </a>.
            </p>
          </section>
        </div>

        <div className="mt-16 pt-8 border-t border-white/5 flex items-center justify-between text-sm text-slate-500">
          <Link href="/" className="hover:text-white transition-colors">&larr; Back to home</Link>
          <Link href="/terms" className="hover:text-white transition-colors">Terms of Service &rarr;</Link>
        </div>
      </div>
    </main>
  );
}
