export function HostingAttribution({ className }: { className?: string }) {
  if (process.env.SIGNALHUB_MIGET_ATTRIBUTION !== "true") return null;

  return (
    <a href="https://miget.com/" target="_blank" rel="noopener noreferrer" className={className}>
      Demo hosting by Miget
    </a>
  );
}
