import { Fingerprint, ArrowLeft } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — Uniq Social",
  description: "Terms of Service for Uniq Social video processing platform.",
};

export default function TermsPage() {
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
        <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-sm text-slate-500 mb-10">Last updated: October 2026</p>

        <div className="space-y-8 text-sm text-slate-300 leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white mb-3">1. Agreement to Terms</h2>
            <p>
              By accessing or using the Uniq Social platform (&quot;Service&quot;), operated by Uniq Social (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">2. Description of Service</h2>
            <p>
              Uniq Social provides a video processing platform that allows users to apply transformations to video files, including randomised edits, metadata changes, and other modifications. The Service operates on a credit-based system where each video processed consumes one or more credits.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">3. Accounts</h2>
            <p>
              You must register for an account to use the Service. You are responsible for maintaining the confidentiality of your account credentials and for all activity under your account. You must provide accurate and complete registration information. We reserve the right to suspend or terminate accounts that violate these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">4. Credits and Payments</h2>
            <p>
              The Service uses a credit-based system. New accounts receive a limited number of free credits. Additional credits can be purchased as one-time packs or through monthly subscription plans. All prices are displayed in GBP and are inclusive of applicable taxes unless otherwise stated. Payments are processed securely via Stripe. Credits are non-transferable and non-refundable except where required by law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">5. Subscriptions</h2>
            <p>
              Monthly subscription plans renew automatically. You may cancel your subscription at any time through your account settings or the Stripe billing portal. Upon cancellation, your plan benefits continue until the end of the current billing period. We reserve the right to change subscription pricing with reasonable notice.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">6. Acceptable Use</h2>
            <p>
              You agree not to use the Service to process content that is illegal, infringes on third-party rights, or violates any applicable laws. You retain all rights to the content you upload and are solely responsible for ensuring you have the necessary rights to process it. We do not claim ownership of your content.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">7. Content and Data</h2>
            <p>
              Uploaded videos are processed and made available for download. We do not store your processed videos indefinitely — files are available for a limited time after processing. You are responsible for downloading your content promptly. We may delete uploaded and processed files after a reasonable retention period.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">8. Limitation of Liability</h2>
            <p>
              The Service is provided &quot;as is&quot; without warranties of any kind. To the maximum extent permitted by law, we shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits, data, or goodwill arising from your use of the Service. Our total liability shall not exceed the amount you paid us in the twelve months preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">9. Modifications</h2>
            <p>
              We reserve the right to modify these Terms at any time. Material changes will be communicated via the email address associated with your account. Continued use of the Service after changes constitutes acceptance of the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">10. Governing Law</h2>
            <p>
              These Terms are governed by the laws of England and Wales. Any disputes shall be subject to the exclusive jurisdiction of the courts of England and Wales.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">11. Contact</h2>
            <p>
              If you have any questions about these Terms, please contact us at{" "}
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
