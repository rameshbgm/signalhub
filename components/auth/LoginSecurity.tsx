import { Fingerprint, KeyRound, LockKeyhole, Server, ShieldCheck, UsersRound } from "lucide-react";
import styles from "./login.module.css";

/** A vector access diagram: protected identity at the center of team access. */
function SecurityIllustration() {
  return (
    <svg aria-hidden="true" viewBox="0 0 460 300" fill="none" className={`${styles.illustration} mx-auto w-full max-w-[460px] text-primary`}>
      <circle cx="230" cy="150" r="122" stroke="currentColor" strokeOpacity="0.1" />
      <circle cx="230" cy="150" r="96" stroke="currentColor" strokeOpacity="0.15" strokeDasharray="3 8" />
      <path d="M91 80H135L170 115M369 80H325L290 115M100 233H143L177 199M360 233H317L283 199" stroke="currentColor" strokeOpacity="0.28" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="135" cy="80" r="3" fill="currentColor" fillOpacity="0.5" />
      <circle cx="325" cy="80" r="3" fill="currentColor" fillOpacity="0.5" />
      <circle cx="143" cy="233" r="3" fill="currentColor" fillOpacity="0.5" />
      <circle cx="317" cy="233" r="3" fill="currentColor" fillOpacity="0.5" />

      <rect x="41" y="48" width="64" height="64" rx="18" fill="white" />
      <KeyRound x="58" y="65" size={30} strokeWidth={1.6} />
      <rect x="355" y="48" width="64" height="64" rx="18" fill="white" />
      <Fingerprint x="372" y="65" size={30} strokeWidth={1.6} />
      <rect x="52" y="201" width="64" height="64" rx="18" fill="white" />
      <LockKeyhole x="69" y="218" size={30} strokeWidth={1.6} />
      <rect x="344" y="201" width="64" height="64" rx="18" fill="white" />
      <UsersRound x="361" y="218" size={30} strokeWidth={1.6} />

      <path d="M230 47C208 63 182 75 155 82V143C155 199 186 234 230 256C274 234 305 199 305 143V82C278 75 252 63 230 47Z" fill="currentColor" fillOpacity="0.08" />
      <path d="M230 39C208 55 182 67 155 74V135C155 191 186 226 230 248C274 226 305 191 305 135V74C278 67 252 55 230 39Z" fill="white" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M230 58C212 71 192 80 173 86V135C173 180 195 208 230 228C265 208 287 180 287 135V86C268 80 248 71 230 58Z" fill="currentColor" fillOpacity="0.06" stroke="currentColor" strokeOpacity="0.15" />
      <circle cx="230" cy="134" r="37" fill="currentColor" />
      <path d="M212 134L225 147L249 122" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M218 190H242M225 200H235" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

const protections = [
  { Icon: LockKeyhole, title: "Encrypted credentials", description: "Sensitive credentials stay encrypted at rest." },
  { Icon: ShieldCheck, title: "Two-step verification", description: "An extra layer of protection for your account." },
  { Icon: UsersRound, title: "Role-based access", description: "The right permissions for every team member." },
];

export function LoginSecurity() {
  return (
    <aside aria-labelledby="login-security-heading" className="relative m-4 hidden rounded-[1.25rem] bg-primary-soft lg:order-1 lg:flex lg:flex-col lg:justify-center">
      <div className={`${styles.securityContent} mx-auto w-full max-w-[540px] px-10 xl:px-14`}>
        <SecurityIllustration />
        <h2 id="login-security-heading" className={`${styles.securityTitle} mt-3 text-balance font-bold leading-[1.16] tracking-[-0.035em] text-ink`}>
          Your operations.<br />Protected by design.
        </h2>
        <p className="mt-3 max-w-sm text-sm leading-6 text-ink-soft">
          Keep your team connected and your customers informed, with secure access to the infrastructure you own.
        </p>
        <ul className="mt-5 space-y-3">
          {protections.map(({ Icon, title, description }) => (
            <li key={title} className="flex items-start gap-3">
              <Icon aria-hidden="true" size={20} strokeWidth={1.75} className="mt-0.5 shrink-0 text-primary-ink" />
              <div>
                <p className="text-sm font-semibold text-ink">{title}</p>
                <p className="mt-0.5 text-xs leading-5 text-ink-soft">{description}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-5 flex items-center gap-2 border-t border-primary/15 pt-4 text-xs text-ink-soft">
          <Server aria-hidden="true" size={14} /> Your infrastructure. Your data. Your control.
        </p>
      </div>
    </aside>
  );
}
