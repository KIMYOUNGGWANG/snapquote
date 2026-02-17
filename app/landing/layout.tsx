export default function LandingLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="!p-0 !m-0 !max-w-none" style={{ padding: 0, margin: 0, maxWidth: 'none' }}>
            <style>{`
        body { padding-bottom: 0 !important; }
        nav:last-of-type { display: none !important; }
        main.container { padding: 0 !important; max-width: none !important; }
        .fixed.bottom-0 { display: none !important; }
      `}</style>
            {children}
        </div>
    )
}
