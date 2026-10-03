import Link from "next/link";
import type { ReactNode } from "react";
import BrandMark from "@/components/brand-mark";
import SiteFooter from "@/components/site-footer";
import { LAST_UPDATED_LABEL } from "@/lib/siteConfig";

export interface LegalSection {
  id: string;
  heading: string;
  body: ReactNode;
}

/**
 * Shared chrome for the four public legal pages.
 *
 * Server component (no hooks) so each page can export `metadata`.
 *
 * Layout notes:
 *  - `bg-canvas` / `bg-surface` / `text-fg-*` / `border-line` are global theme
 *    tokens from src/app/globals.css and are dark-mode aware. Public pages that
 *    hard-code hex (like /trial) render incorrectly for dark-mode visitors.
 *  - Body copy is hand-rolled: `@tailwindcss/typography` is not installed, and
 *    the global `body` is 14px/1.5, which is too tight for legal text.
 *  - Desktop gets a sticky table of contents when sections are supplied;
 *    mobile collapses it into a native <details>, so it needs no JS.
 */
export default function LegalShell({
  title,
  intro,
  sections,
  updated = true,
  children,
}: {
  title: string;
  intro?: ReactNode;
  sections?: LegalSection[];
  /** Set false for pages (e.g. contact) that are not dated documents. */
  updated?: boolean;
  children?: ReactNode;
}) {
  const hasToc = Array.isArray(sections) && sections.length > 1;

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-fg">
      <header className="border-b border-line bg-bar">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link
            href="/book-trial"
            className="min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            aria-label={`${"Corhaus"} home`}
          >
            <BrandMark size="md" />
          </Link>
          <Link
            href="/book-trial"
            className="shrink-0 rounded-xl border border-line bg-surface px-4 py-2 text-xs font-semibold text-fg transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            Book a trial
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <div
          className={
            hasToc
              ? "lg:grid lg:grid-cols-[minmax(0,1fr)_240px] lg:gap-10 lg:items-start"
              : ""
          }
        >
          <article className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-fg sm:text-3xl">
              {title}
            </h1>

            {updated && (
              <p className="mt-2 text-xs text-fg-4">
                Last updated:{" "}
                <time>{LAST_UPDATED_LABEL}</time>
              </p>
            )}

            {intro && (
              <div className="mt-5 rounded-2xl border border-line bg-surface p-4 text-[13px] leading-relaxed text-fg-2 sm:p-5 sm:text-sm">
                {intro}
              </div>
            )}

            {sections?.map((section) => (
              <section
                key={section.id}
                id={section.id}
                className="mt-8 scroll-mt-24"
              >
                <h2 className="text-lg font-semibold tracking-tight text-fg sm:text-xl">
                  {section.heading}
                </h2>
                <div className="mt-3 space-y-3.5 text-[15px] leading-relaxed text-fg-2">
                  {section.body}
                </div>
              </section>
            ))}

            {children}
          </article>

          {hasToc && (
            <nav
              aria-label="On this page"
              className="mt-10 lg:sticky lg:top-6 lg:mt-0"
            >
              {/* Desktop rail */}
              <div className="hidden lg:block">
                <p className="text-[10px] font-bold uppercase tracking-wider text-fg-4">
                  On this page
                </p>
                <ul className="mt-3 space-y-1.5 border-l border-line pl-3">
                  {sections!.map((section) => (
                    <li key={section.id}>
                      <a
                        href={`#${section.id}`}
                        className="block text-xs text-fg-3 underline-offset-2 transition-colors hover:text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                      >
                        {section.heading}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Mobile collapse */}
              <details className="lg:hidden rounded-2xl border border-line bg-surface p-4">
                <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-fg-3 marker:text-fg-4">
                  On this page
                </summary>
                <ul className="mt-3 space-y-1.5">
                  {sections!.map((section) => (
                    <li key={section.id}>
                      <a
                        href={`#${section.id}`}
                        className="block text-sm text-fg-3 underline-offset-2 hover:text-fg hover:underline"
                      >
                        {section.heading}
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            </nav>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

/** Consistent lead paragraph inside a section. */
export function LegalP({ children }: { children: ReactNode }) {
  return <p>{children}</p>;
}

/** Unordered list with readable markers. */
export function LegalList({ children }: { children: ReactNode }) {
  return (
    <ul className="list-disc space-y-2 pl-5 marker:text-fg-4">{children}</ul>
  );
}

/** Ordered list with readable markers. */
export function LegalOrderedList({ children }: { children: ReactNode }) {
  return (
    <ol className="list-decimal space-y-2 pl-5 marker:text-fg-4 marker:font-semibold">
      {children}
    </ol>
  );
}

/**
 * Inline cross-link to another legal page.
 */
export function LegalLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      className="font-medium text-fg underline decoration-line-2 underline-offset-2 transition-colors hover:decoration-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
    >
      {children}
    </a>
  );
}