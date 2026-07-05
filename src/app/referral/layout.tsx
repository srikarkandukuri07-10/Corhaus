export default function ReferralLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-brand-cream">
      <div className="max-w-md mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-light tracking-tight text-brand-navy">
            Cor<span className="text-brand-brown font-medium">haus</span>
          </h1>
          <p className="text-brand-brown-light mt-2 text-sm tracking-widest uppercase">
            Pilates for everyone
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
