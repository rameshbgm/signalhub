import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { BellRing, CircleAlert, MailX } from "lucide-react";
import { FlashToast } from "@/components/ui/flash-toast";
import { PageDesignShell, contentWidthClass } from "@/components/public/PageDesignShell";
import { PublicFooter, PublicHeader } from "@/components/public/PublicChrome";
import { SubscriptionPreferencesForm } from "@/components/public/SubscriptionPreferencesForm";
import { scopeCustomCss } from "@/lib/custom-css";
import { pageDesignFor } from "@/lib/page-design";
import { getPublicPageBySlug } from "@/lib/pages";
import { findSubscription, maskContact, subscribableComponents } from "@/lib/subscriptions";
import { saveSubscriptionPreferences, unsubscribeFromPage } from "./actions";

// The URL carries a private token: keep it out of search engines and referrers.
export const metadata: Metadata = {
  title: "Subscription preferences",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const ERRORS: Record<string, string> = {
  choose: "Choose at least one service, or select All services.",
  save: "Your preferences could not be saved. Reload the page and try again.",
  unsubscribe: "You could not be unsubscribed right now. Try again in a moment.",
};

export default async function SubscriptionPreferencesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; token: string }>;
  searchParams: Promise<{ saved?: string; unsubscribed?: string; error?: string }>;
}) {
  const { slug, token } = await params;
  const state = await searchParams;
  const page = await getPublicPageBySlug(slug);
  if (!page) notFound();
  const subscription = await findSubscription(token);
  // A token only works on the page it belongs to.
  if (subscription && subscription.slug !== page.slug) notFound();
  const design = pageDesignFor(page);
  const statusPath = page.isHub ? `/hub/${encodeURIComponent(page.slug)}` : `/${encodeURIComponent(page.slug)}`;

  let body: ReactNode;
  if (state.unsubscribed && !subscription) {
    body = (
      <Panel icon={<MailX aria-hidden size={22} />} title="You're unsubscribed" description={`You will no longer receive incident or maintenance updates from ${page.name}.`}>
        <Link href={statusPath} className="text-sm font-medium underline underline-offset-4" style={{ color: "var(--page-brand)" }}>
          Changed your mind? Subscribe again from the status page
        </Link>
      </Panel>
    );
  } else if (!subscription) {
    body = (
      <Panel icon={<CircleAlert aria-hidden size={22} />} title="This link is no longer valid" description="The subscription may already have been removed. You can subscribe again from the status page.">
        <Link href={statusPath} className="text-sm font-medium underline underline-offset-4" style={{ color: "var(--page-brand)" }}>
          Go to {page.name}
        </Link>
      </Panel>
    );
  } else {
    const services = await subscribableComponents(page.id);
    const followed = subscription.componentIds.filter((id) => services.some((service) => service.id === id));
    const channel = subscription.channel === "SMS" ? "text message" : "email";
    body = (
      <Panel
        icon={<BellRing aria-hidden size={22} />}
        title="Subscription preferences"
        description={`Updates from ${page.name} are sent by ${channel} to ${maskContact(subscription.contact)}.`}
      >
        {state.saved && <FlashToast tone="ok" message="Your preferences are saved." />}
        {state.error && ERRORS[state.error] && <FlashToast tone="danger" message={ERRORS[state.error]} />}
        {subscription.quarantined && (
          <p className="mb-5 text-sm text-[var(--fg-soft)]">Deliveries to this address are paused because earlier messages could not be delivered. Contact the page owner to resume them.</p>
        )}
        <SubscriptionPreferencesForm
          services={services}
          selectedIds={followed}
          scopeLocked={subscription.pageType === "AUDIENCE"}
          saveAction={saveSubscriptionPreferences.bind(null, page.slug, token)}
          unsubscribeAction={unsubscribeFromPage.bind(null, page.slug, token)}
        />
        <p className="mt-6 text-xs text-[var(--fg-dim)]">
          <Link href={statusPath} className="underline underline-offset-4">Back to {page.name}</Link>
        </p>
      </Panel>
    );
  }

  return (
    <PageDesignShell pageId={page.id} publishedVersion={page.publishedDesignVersion} design={design} customCss={scopeCustomCss(page.customCss, page.id)} language={page.language}>
      <PublicHeader name={page.name} logoUrl={page.logoUrl} supportUrl={page.supportUrl} layout={page.layout} coverImageUrl={null} brandColor={page.brandColor} design={design} />
      <main className={`${contentWidthClass(design)} mx-auto w-full px-4 py-10 sm:px-6 sm:py-14`}>
        <div className="mx-auto max-w-xl">{body}</div>
      </main>
      <PublicFooter removeBranding={page.removeBranding} termsUrl={page.termsUrl} privacyUrl={page.privacyUrl} supportUrl={page.supportUrl} design={design} />
    </PageDesignShell>
  );
}

function Panel({ icon, title, description, children }: { icon: ReactNode; title: string; description: string; children: ReactNode }) {
  return (
    <section className="page-panel border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-8">
      <span className="flex size-10 items-center justify-center rounded-full bg-[var(--bg)]" style={{ color: "var(--page-brand)" }}>{icon}</span>
      <h1 className="mt-4 text-xl font-semibold text-[var(--fg)]">{title}</h1>
      <p className="mt-1.5 text-sm leading-6 text-[var(--fg-soft)]">{description}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}
