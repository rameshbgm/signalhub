// Demo data catalog for scripts/seed-demo.ts: hubs, their status pages, and the public URLs each page monitors.

export type Kind = "HTTP" | "KEYWORD" | "DNS" | "TCP" | "TLS" | "ICMP";
export type Spec = {
  name: string;
  target: string;
  kind?: Kind;
  port?: number;
  range?: string;
  keyword?: string;
  expectFail?: boolean; // the endpoint really returns an error: shows a live outage
  minutes?: number; // check interval
  paused?: boolean; // monitor created disabled
  unpublished?: boolean; // service hidden from the public page
};
export type Group = { name: string; description: string; monitors: Spec[] };
export type PageSpec = {
  slug: string; name: string; headline: string; about: string; color: string; groups: Group[];
  access?: "PUBLIC" | "PRIVATE" | "AUDIENCE"; // default PUBLIC
  state?: "published" | "draft" | "hidden"; // default published
};
export type HubSpec = { slug: string; name: string; headline: string; about: string; color: string; pages: PageSpec[] };

type Sites = Record<string, Array<[name: string, url: string]>>;
const interval = 15; // minutes; keeps the load on third-party sites polite
function page(slug: string, name: string, color: string, about: string, sites: Sites, extra: Partial<PageSpec> = {}): PageSpec {
  return {
    slug, name, color, about, headline: `${name} status`,
    groups: Object.entries(sites).map(([group, list]) => ({
      name: group, description: `${group} services`,
      monitors: list.map(([n, url]) => ({ name: n, target: url, minutes: interval })),
    })),
    ...extra,
  };
}

export const EXTRA_HUBS: HubSpec[] = [
  {
    slug: "open-source-hub", name: "Open Source Ecosystem", color: "#16a34a",
    headline: "Open source infrastructure", about: "Operating systems, databases, frameworks and tooling the open source world runs on.",
    pages: [
      page("linux-distros", "Linux Distributions", "#f97316", "Download mirrors and home pages of major Linux distributions.", {
        "Debian family": [["Debian", "https://www.debian.org"], ["Ubuntu", "https://ubuntu.com"], ["Linux Mint", "https://linuxmint.com"]],
        "Red Hat family": [["Fedora", "https://fedoraproject.org"], ["Rocky Linux", "https://rockylinux.org"], ["AlmaLinux", "https://almalinux.org"]],
        Independent: [["Arch Linux", "https://archlinux.org"], ["Alpine Linux", "https://alpinelinux.org"], ["NixOS", "https://nixos.org"], ["Linux kernel", "https://www.kernel.org"]],
      }),
      page("databases", "Databases", "#2563eb", "Project sites and docs of popular databases.", {
        Relational: [["PostgreSQL", "https://www.postgresql.org"], ["MySQL", "https://www.mysql.com"], ["MariaDB", "https://mariadb.org"], ["SQLite", "https://www.sqlite.org"]],
        "NoSQL & cache": [["MongoDB", "https://www.mongodb.com"], ["Redis", "https://redis.io"], ["Apache Cassandra", "https://cassandra.apache.org"], ["CouchDB", "https://couchdb.apache.org"]],
      }),
      page("web-frameworks", "Web Frameworks", "#0ea5e9", "Documentation sites of frontend and backend frameworks.", {
        Frontend: [["React", "https://react.dev"], ["Vue", "https://vuejs.org"], ["Angular", "https://angular.dev"], ["Svelte", "https://svelte.dev"], ["Next.js", "https://nextjs.org"]],
        Backend: [["Django", "https://www.djangoproject.com"], ["Ruby on Rails", "https://rubyonrails.org"], ["Laravel", "https://laravel.com"], ["Spring", "https://spring.io"], ["FastAPI", "https://fastapi.tiangolo.com"]],
      }),
      page("cloud-native", "Cloud Native", "#7c3aed", "Container and observability project sites.", {
        Orchestration: [["Kubernetes", "https://kubernetes.io"], ["Helm", "https://helm.sh"], ["Podman", "https://podman.io"], ["containerd", "https://containerd.io"]],
        Observability: [["Prometheus", "https://prometheus.io"], ["Grafana", "https://grafana.com"], ["OpenTelemetry", "https://opentelemetry.io"], ["Jaeger", "https://www.jaegertracing.io"]],
      }),
      page("ci-cd", "CI/CD Tooling", "#db2777", "Build and delivery tool sites.", {
        Pipelines: [["Jenkins", "https://www.jenkins.io"], ["CircleCI", "https://circleci.com"], ["GitHub Actions docs", "https://docs.github.com/en/actions"], ["Argo CD", "https://argo-cd.readthedocs.io"]],
        Artifacts: [["JFrog", "https://jfrog.com"], ["Sonatype", "https://www.sonatype.com"], ["Harbor", "https://goharbor.io"]],
      }),
      page("editors-ides", "Editors & IDEs", "#ea580c", "Developer editor download pages.", {
        Editors: [["Visual Studio Code", "https://code.visualstudio.com"], ["Neovim", "https://neovim.io"], ["Vim", "https://www.vim.org"], ["Zed", "https://zed.dev"]],
        IDEs: [["JetBrains", "https://www.jetbrains.com"], ["Eclipse", "https://www.eclipse.org"], ["Android Studio", "https://developer.android.com/studio"]],
      }),
      page("learning-docs", "Docs & Learning", "#059669", "Reference documentation and learning platforms.", {
        Reference: [["MDN Web Docs", "https://developer.mozilla.org"], ["W3C", "https://www.w3.org"], ["Wikipedia", "https://www.wikipedia.org"], ["DevDocs", "https://devdocs.io"]],
        Courses: [["freeCodeCamp", "https://www.freecodecamp.org"], ["Khan Academy", "https://www.khanacademy.org"], ["The Odin Project", "https://www.theodinproject.com"]],
      }),
      page("internal-mirrors", "Internal Mirrors", "#475569", "Private mirrors for the platform team; password protected.", {
        Mirrors: [["Debian archive mirror", "https://deb.debian.org"], ["PyPI mirror index", "https://pypi.org/simple/"], ["npm mirror", "https://registry.npmjs.org/"]],
      }, { access: "PRIVATE" }),
    ],
  },
  {
    slug: "media-hub", name: "Media & Content", color: "#e11d48",
    headline: "Media & content platforms", about: "News, streaming, reference and music sites our editorial teams depend on.",
    pages: [
      page("news-outlets", "News Outlets", "#dc2626", "Major newsroom sites.", {
        International: [["BBC", "https://www.bbc.com"], ["Reuters", "https://www.reuters.com"], ["The Guardian", "https://www.theguardian.com"], ["Al Jazeera", "https://www.aljazeera.com"]],
        Public: [["NPR", "https://www.npr.org"], ["PBS", "https://www.pbs.org"], ["Deutsche Welle", "https://www.dw.com"]],
      }),
      page("video-streaming", "Video & Streaming", "#7c3aed", "Video platforms.", {
        Platforms: [["YouTube", "https://www.youtube.com"], ["Vimeo", "https://vimeo.com"], ["Twitch", "https://www.twitch.tv"], ["Dailymotion", "https://www.dailymotion.com"]],
      }),
      page("social-community", "Social & Community", "#0ea5e9", "Community and social networks.", {
        Networks: [["Mastodon", "https://mastodon.social"], ["Pinterest", "https://www.pinterest.com"], ["Tumblr", "https://www.tumblr.com"]],
        Forums: [["Hacker News", "https://news.ycombinator.com"], ["Stack Exchange", "https://stackexchange.com"], ["Discourse", "https://www.discourse.org"]],
      }),
      page("reference-archives", "Reference & Archives", "#059669", "Open knowledge projects.", {
        Knowledge: [["Wikipedia", "https://en.wikipedia.org"], ["Wikimedia Commons", "https://commons.wikimedia.org"], ["Internet Archive", "https://archive.org"], ["OpenStreetMap", "https://www.openstreetmap.org"]],
        Libraries: [["Project Gutenberg", "https://www.gutenberg.org"], ["Open Library", "https://openlibrary.org"], ["Library of Congress", "https://www.loc.gov"]],
      }),
      page("music-audio", "Music & Audio", "#f59e0b", "Music and podcast services.", {
        Music: [["Spotify", "https://www.spotify.com"], ["SoundCloud", "https://soundcloud.com"], ["Bandcamp", "https://bandcamp.com"], ["Last.fm", "https://www.last.fm"]],
        Podcasts: [["Apple Podcasts", "https://podcasts.apple.com"], ["Podbean", "https://www.podbean.com"]],
      }),
      page("creator-tools", "Creator Tools", "#db2777", "Publishing and design tools.", {
        Publishing: [["WordPress", "https://wordpress.com"], ["Medium", "https://medium.com"], ["Substack", "https://substack.com"], ["Ghost", "https://ghost.org"]],
        Design: [["Canva", "https://www.canva.com"], ["Unsplash", "https://unsplash.com"], ["Adobe", "https://www.adobe.com"]],
      }, { state: "draft" }),
    ],
  },
  {
    slug: "public-sector-hub", name: "Government & Education", color: "#1d4ed8",
    headline: "Public sector & education", about: "Government portals, universities, research and open data services.",
    pages: [
      page("us-government", "US Government", "#1e40af", "Federal agency portals.", {
        Agencies: [["USA.gov", "https://www.usa.gov"], ["NASA", "https://www.nasa.gov"], ["NOAA", "https://www.noaa.gov"], ["CDC", "https://www.cdc.gov"]],
        Services: [["Weather.gov", "https://www.weather.gov"], ["USGS", "https://www.usgs.gov"], ["Library of Congress", "https://www.loc.gov"]],
      }),
      page("europe-uk", "Europe & UK", "#2563eb", "European institutions and UK services.", {
        EU: [["European Union", "https://european-union.europa.eu"], ["Eurostat", "https://ec.europa.eu/eurostat"], ["ESA", "https://www.esa.int"]],
        UK: [["GOV.UK", "https://www.gov.uk"], ["NHS", "https://www.nhs.uk"], ["Met Office", "https://www.metoffice.gov.uk"]],
      }),
      page("universities", "Universities", "#7c3aed", "Leading university web properties.", {
        "United States": [["MIT", "https://www.mit.edu"], ["Stanford", "https://www.stanford.edu"], ["Harvard", "https://www.harvard.edu"], ["Berkeley", "https://www.berkeley.edu"]],
        Europe: [["Oxford", "https://www.ox.ac.uk"], ["Cambridge", "https://www.cam.ac.uk"], ["ETH Zurich", "https://ethz.ch"], ["TU Delft", "https://www.tudelft.nl"]],
      }),
      page("science-research", "Science & Research", "#059669", "Preprint servers and research institutes.", {
        Publishing: [["Nature", "https://www.nature.com"], ["arXiv", "https://arxiv.org"], ["PubMed", "https://pubmed.ncbi.nlm.nih.gov"], ["PLOS", "https://plos.org"]],
        Institutes: [["CERN", "https://home.cern"], ["Max Planck", "https://www.mpg.de/en"], ["Smithsonian", "https://www.si.edu"]],
      }),
      page("open-data", "Open Data", "#0891b2", "Open data portals and global statistics.", {
        Portals: [["Data.gov", "https://data.gov"], ["data.gov.uk", "https://www.data.gov.uk"], ["World Bank", "https://www.worldbank.org"]],
        Health: [["WHO", "https://www.who.int"], ["Our World in Data", "https://ourworldindata.org"], ["UNICEF", "https://www.unicef.org"]],
      }, { access: "AUDIENCE" }),
    ],
  },
  {
    slug: "commerce-hub", name: "E-commerce & Finance", color: "#d97706",
    headline: "Commerce & finance services", about: "Marketplaces, payment rails, travel, logistics and market data providers.",
    pages: [
      page("marketplaces", "Marketplaces", "#f59e0b", "Online marketplaces.", {
        Global: [["Amazon", "https://www.amazon.com"], ["eBay", "https://www.ebay.com"], ["Etsy", "https://www.etsy.com"], ["AliExpress", "https://www.aliexpress.com"]],
        Retail: [["Walmart", "https://www.walmart.com"], ["Target", "https://www.target.com"], ["IKEA", "https://www.ikea.com"], ["Best Buy", "https://www.bestbuy.com"]],
      }),
      page("payment-providers", "Payment Providers", "#2563eb", "Payment processors and wallets.", {
        Processors: [["Adyen", "https://www.adyen.com"], ["Square", "https://squareup.com"], ["Checkout.com", "https://www.checkout.com"], ["Razorpay", "https://razorpay.com"]],
        Wallets: [["Wise", "https://wise.com"], ["Klarna", "https://www.klarna.com"], ["Revolut", "https://www.revolut.com"]],
      }),
      page("crypto-exchanges", "Crypto Exchanges", "#7c3aed", "Digital asset venues.", {
        Exchanges: [["Coinbase", "https://www.coinbase.com"], ["Kraken", "https://www.kraken.com"], ["Bitstamp", "https://www.bitstamp.net"], ["Gemini", "https://www.gemini.com"]],
        Data: [["CoinGecko", "https://www.coingecko.com"], ["CoinMarketCap", "https://coinmarketcap.com"]],
      }),
      page("market-data", "Market Data", "#059669", "Exchanges and financial news.", {
        Exchanges: [["Nasdaq", "https://www.nasdaq.com"], ["NYSE", "https://www.nyse.com"], ["London Stock Exchange", "https://www.londonstockexchange.com"], ["Deutsche Börse", "https://www.deutsche-boerse.com"]],
        News: [["Bloomberg", "https://www.bloomberg.com"], ["Financial Times", "https://www.ft.com"], ["Investopedia", "https://www.investopedia.com"]],
      }),
      page("shipping-logistics", "Shipping & Logistics", "#ea580c", "Carrier tracking sites.", {
        Carriers: [["UPS", "https://www.ups.com"], ["FedEx", "https://www.fedex.com"], ["DHL", "https://www.dhl.com"], ["USPS", "https://www.usps.com"]],
        Freight: [["Maersk", "https://www.maersk.com"], ["Flexport", "https://www.flexport.com"]],
      }),
      page("travel-booking", "Travel & Booking", "#0ea5e9", "Travel and booking sites.", {
        Stays: [["Booking.com", "https://www.booking.com"], ["Airbnb", "https://www.airbnb.com"], ["Hotels.com", "https://www.hotels.com"]],
        Flights: [["Expedia", "https://www.expedia.com"], ["Skyscanner", "https://www.skyscanner.com"], ["Kayak", "https://www.kayak.com"]],
      }),
      page("fintech-apis", "Fintech APIs", "#475569", "Developer API sandboxes.", {
        APIs: [["Stripe API", "https://api.stripe.com"], ["Plaid", "https://plaid.com"], ["Open Exchange Rates", "https://openexchangerates.org"], ["Frankfurter FX", "https://api.frankfurter.app/latest"]],
      }, { state: "hidden" }),
    ],
  },
];
