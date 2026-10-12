import { Fingerprint } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Terms of Service | UniqSocial",
  description: "Terms of Service for UniqSocial video processing platform.",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#010313] text-white">
      <nav className="border-b border-white/5 bg-[#010313]/80 backdrop-blur-xl">
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
        <h1 className="text-3xl sm:text-4xl font-bold mb-2">Terms of Service</h1>
        <p className="text-sm text-slate-500 mb-10">Last updated: 12 October 2026</p>

        <div className="space-y-8 text-slate-300 text-[15px] leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white mb-3">1. Acceptance of Terms</h2>
            <p>
              By accessing or using UniqSocial (&quot;the Service&quot;), operated at uniqsocial.com,
              you agree to be bound by these Terms of Service. If you do not agree to these terms,
              you may not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">2. Description of Service</h2>
            <p>
              UniqSocial provides automated video processing tools that apply transformations
              including trimming, cutting, zooming, mirroring, grain, sharpening, and metadata
              injection to create unique variations of uploaded videos. The Service operates on a
              credit-based system.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">3. Account Registration</h2>
            <p>
              You must register an account to use the Service. You are responsible for maintaining
              the confidentiality of your account credentials and for all activity that occurs under
              your account. You must provide accurate and complete information during registration
              and keep your account information updated.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">4. Credits and Payments</h2>
            <p>
              The Service uses a credit-based system. Each video processed consumes one credit.
              Credits can be purchased through one-time top-ups or monthly subscription plans.
              All payments are processed through Stripe in GBP (£). Credits are non-refundable
              and non-transferable unless otherwise required by applicable law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">5. Subscriptions</h2>
            <p>
              Monthly subscription plans automatically renew at the end of each billing cycle unless
              cancelled. You may cancel your subscription at any time through your account settings.
              Upon cancellation, you will retain access to your remaining credits but will not receive
              new credits at the next billing cycle.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">6. Acceptable Use</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1.5">
              <li>Upload content that infringes on any third-party intellectual property rights</li>
              <li>Upload illegal, harmful, threatening, abusive, or otherwise objectionable content</li>
              <li>Use the Service to process content depicting minors in any inappropriate context</li>
              <li>Attempt to reverse-engineer, decompile, or disassemble the Service</li>
              <li>Use automated scripts or bots to access the Service beyond the provided API</li>
              <li>Resell or redistribute the Service without written permission</li>
              <li>Interfere with or disrupt the integrity or performance of the Service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">7. API Access</h2>
            <p>
              API keys grant programmatic access to the Service. You are responsible for securing
              your API keys. Any usage through your API keys counts against your credit balance.
              We reserve the right to revoke API access if it is used in violation of these terms
              or if it negatively impacts Service performance.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">8. Content and Ownership</h2>
            <p>
              You retain all rights to the videos you upload and the processed outputs. We do not
              claim ownership of your content. Uploaded videos are processed in real-time and are
              not stored on our servers beyond the duration required for processing.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">9. Limitation of Liability</h2>
            <p>
              The Service is provided &quot;as is&quot; without warranties of any kind. We shall not
              be liable for any indirect, incidental, special, consequential, or punitive damages
              resulting from your use of or inability to use the Service. Our total liability shall
              not exceed the amount you paid for the Service in the 12 months preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">10. Account Termination</h2>
            <p>
              We reserve the right to suspend or terminate your account at any time for violation
              of these terms. You may delete your account at any time through your account settings.
              Upon deletion, all associated data will be permanently removed.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">11. Changes to Terms</h2>
            <p>
              We may update these Terms of Service from time to time. We will notify you of any
              material changes by email or through the Service. Your continued use of the Service
              after changes become effective constitutes acceptance of the revised terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">12. Contact</h2>
            <p>
              If you have any questions about these Terms, please contact us at{" "}
              <a href="mailto:support@uniqsocial.com" className="text-purple-400 hover:text-purple-300 transition-colors">
                support@uniqsocial.com
              </a>.
            </p>
          </section>
        </div>

        <div className="mt-16 pt-8 border-t border-white/5 flex items-center justify-between text-sm text-slate-500">
          <Link href="/" className="hover:text-white transition-colors">&larr; Back to home</Link>
          <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy &rarr;</Link>
        </div>
      </div>
    </main>
  );
}
