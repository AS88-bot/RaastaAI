import { RaastaWordmark } from './Logo';

export function Footer({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <footer className="border-t border-[#E5E3DC] bg-[#F3F1EC]/70 mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          <div className="md:col-span-5 space-y-3">
            <RaastaWordmark />
            <p className="text-sm text-[#4F5651] leading-relaxed max-w-sm">
              Citizen-first civic infrastructure reporting and community intelligence, built for
              Hyderabad neighborhoods and expanding across Indian cities.
            </p>
          </div>

          <div className="md:col-span-4 space-y-2.5">
            <h3 className="text-xs font-semibold text-[#1A1D1B] tracking-wide">Platform</h3>
            <ul className="space-y-2 text-sm text-[#4F5651]">
              <li>
                <a
                  href="/feed"
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate('/feed');
                  }}
                  className="hover:text-[#14452F] transition-colors"
                >
                  Community Feed
                </a>
              </li>
              <li>
                <a
                  href="/map"
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate('/map');
                  }}
                  className="hover:text-[#14452F] transition-colors"
                >
                  Interactive Issue Map
                </a>
              </li>
              <li>
                <a
                  href="/insights"
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate('/insights');
                  }}
                  className="hover:text-[#14452F] transition-colors"
                >
                  Civic Insights &amp; Trends
                </a>
              </li>
              <li>
                <a
                  href="/report"
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate('/report');
                  }}
                  className="hover:text-[#14452F] transition-colors"
                >
                  Submit a Street Report
                </a>
              </li>
            </ul>
          </div>

          <div className="md:col-span-3 space-y-2.5">
            <h3 className="text-xs font-semibold text-[#1A1D1B] tracking-wide">
              Transparency &amp; Privacy
            </h3>
            <p className="text-xs text-[#717873] leading-relaxed">
              Public feeds display only street-level locations and issue photographs. Citizen emails
              and private contact details are never exposed publicly. AI assessments are advisory
              until reviewed by an administrator.
            </p>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-[#E5E3DC] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-[#717873]">
          <p>© {new Date().getFullYear()} RaastaAI Civic Initiative · Hyderabad, Telangana</p>
          <p>
            Maps powered by Google Maps Platform · Use subject to{' '}
            <a
              href="https://cloud.google.com/maps-platform/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-[#1A1D1B]"
            >
              Google Maps Terms of Service
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
