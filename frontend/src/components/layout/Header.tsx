interface HeaderProps {
  title: string;
  subtitle?: string;
  /** Optional right-side actions (buttons, badges, etc.) */
  actions?: React.ReactNode;
}

export default function Header({ title, subtitle, actions }: HeaderProps) {
  return (
    <div
      className="sticky top-0 z-20 px-6 py-4 flex items-center justify-between gap-4 backdrop-blur-lg"
      style={{
        background: 'rgba(5, 8, 22, 0.55)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div className="min-w-0">
        <h1 className="text-lg font-semibold text-ink-100 truncate">{title}</h1>
        {subtitle && <p className="text-sm text-ink-500 mt-0.5 truncate">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  );
}