/**
 * Police non-emergency numbers, by area. Each was checked against the police department's or
 * city's own website (November 2026); the source is kept with it. Places whose number we couldn't
 * confirm on an official site aren't listed: a wrong number is worse than none.
 *
 * `dial` is what the phone calls. 311 only works inside that city, so those list an `outside`
 * number too. `km` is roughly how far from the center the department covers.
 */
export type PoliceLine = {
  key: string;
  area: string;
  agency: string;
  dial: string;
  outside?: string;
  hours?: string;
  lat: number;
  lng: number;
  km: number;
  /** A rough outline [lat, lng][] for places where a circle spills over a border (DC). */
  shape?: [number, number][];
  source: string;
};

/** DC's borders: straight lines on the Maryland sides, the Virginia shore of the Potomac on the other. */
const DC_SHAPE: [number, number][] = [
  [38.9955, -77.041],
  [38.893, -76.9094],
  [38.7916, -77.039],
  [38.85, -77.037],
  [38.87, -77.045],
  [38.8838, -77.06],
  [38.8985, -77.069],
  [38.912, -77.09],
  [38.9342, -77.1198],
];

export const POLICE_LINES: PoliceLine[] = [
  // ── DC area ────────────────────────────────────────────────────────────────
  { key: 'dc', area: 'Washington, DC', agency: 'DC Metropolitan Police', dial: '311', lat: 38.9072, lng: -77.0369, km: 14, shape: DC_SHAPE, source: 'https://ouc.dc.gov/page/call-311-police-non-emergencies' },
  { key: 'arlington-va', area: 'Arlington, VA', agency: 'Arlington County Police', dial: '703-558-2222', lat: 38.8816, lng: -77.091, km: 7, source: 'https://www.arlingtonva.us/Government/Departments/Police-Department/Online-Police-Reporting-System' },
  { key: 'alexandria-va', area: 'Alexandria, VA', agency: 'Alexandria Police', dial: '703-746-4444', lat: 38.8048, lng: -77.0469, km: 6, source: 'https://www.alexandriava.gov/980' },
  { key: 'falls-church-va', area: 'Falls Church, VA', agency: 'Falls Church City Police', dial: '703-241-5053', lat: 38.8823, lng: -77.1711, km: 2, source: 'https://www.fcnp.com/2024/02/09/falls-church-police-beware-of-phone-scammers-impersonating-law-enforcement' },
  { key: 'fairfax-county-va', area: 'Fairfax County, VA', agency: 'Fairfax County Police', dial: '703-691-2131', lat: 38.8462, lng: -77.3064, km: 25, source: 'https://www.fairfaxcounty.gov/police/report-crime' },
  { key: 'montgomery-county-md', area: 'Montgomery County, MD', agency: 'Montgomery County Police', dial: '301-279-8000', lat: 39.084, lng: -77.1528, km: 28, source: 'https://www.montgomerycountymd.gov/OPI/make_right_call.html' },
  { key: 'prince-georges-md', area: 'Prince George’s County, MD', agency: 'Prince George’s County Police', dial: '301-352-1200', lat: 38.83, lng: -76.85, km: 28, source: 'https://www.princegeorgescountymd.gov/government/county-government/departments--offices/public-safety/homeland-security/about-us/divisions/public-safety-communications/non-emergency-dispatch-number' },
  { key: 'baltimore-md', area: 'Baltimore, MD', agency: 'Baltimore Police', dial: '311', outside: '443-263-2220', lat: 39.2904, lng: -76.6122, km: 14, source: 'https://www.baltimorecity.gov/transportation/snow-center/important-phone-numbers' },
  { key: 'richmond-va', area: 'Richmond, VA', agency: 'Richmond Police', dial: '804-646-5100', lat: 37.5407, lng: -77.436, km: 12, source: 'https://rva.gov/police/police-faqs' },
  { key: 'virginia-beach-va', area: 'Virginia Beach, VA', agency: 'Virginia Beach Police', dial: '757-385-5000', lat: 36.8529, lng: -75.978, km: 25, source: 'https://police.virginiabeach.gov/community/contact' },
  // ── Major US cities ────────────────────────────────────────────────────────
  { key: 'new-york-ny', area: 'New York, NY', agency: 'NYPD', dial: '311', lat: 40.7128, lng: -74.006, km: 30, source: 'https://www.nyc.gov/site/nypd/about/about-nypd/contact-us.page' },
  { key: 'los-angeles-ca', area: 'Los Angeles, CA', agency: 'LAPD', dial: '877-275-5273', lat: 34.0522, lng: -118.2437, km: 35, source: 'https://www.lapdonline.org/contact-us/' },
  { key: 'chicago-il', area: 'Chicago, IL', agency: 'Chicago Police', dial: '311', outside: '312-746-6000', lat: 41.8781, lng: -87.6298, km: 25, source: 'https://www.chicagopolice.org/about/contact-us/use-3-1-1-to-report-non-emergency-situations/' },
  { key: 'houston-tx', area: 'Houston, TX', agency: 'Houston Police', dial: '713-884-3131', lat: 29.7604, lng: -95.3698, km: 35, source: 'https://www.houstontx.gov/police/contact/index.htm' },
  { key: 'phoenix-az', area: 'Phoenix, AZ', agency: 'Phoenix Police (Crime Stop)', dial: '602-262-6151', lat: 33.4484, lng: -112.074, km: 30, source: 'https://phoenix.gov/police/contact-police' },
  { key: 'philadelphia-pa', area: 'Philadelphia, PA', agency: 'Philadelphia Police', dial: '311', outside: '215-686-8686', lat: 39.9526, lng: -75.1652, km: 20, source: 'https://www.phillypolice.com/about/ppd-contacts/' },
  { key: 'san-antonio-tx', area: 'San Antonio, TX', agency: 'San Antonio Police', dial: '210-207-7273', lat: 29.4241, lng: -98.4936, km: 30, source: 'https://sa.gov/directory/departments/sapd/contact' },
  { key: 'san-diego-ca', area: 'San Diego, CA', agency: 'San Diego Police', dial: '619-531-2000', lat: 32.7157, lng: -117.1611, km: 25, source: 'https://www.sandiego.gov/police/contact' },
  { key: 'dallas-tx', area: 'Dallas, TX', agency: 'Dallas Police', dial: '214-744-4444', lat: 32.7767, lng: -96.797, km: 25, source: 'https://www.dallaspolice.net/abouts/helpfulnumbers' },
  { key: 'jacksonville-fl', area: 'Jacksonville, FL', agency: 'Jacksonville Sheriff’s Office', dial: '904-630-0500', lat: 30.3322, lng: -81.6557, km: 35, source: 'https://jaxsheriff.org/' },
  { key: 'fort-worth-tx', area: 'Fort Worth, TX', agency: 'Fort Worth Police', dial: '817-392-4222', lat: 32.7555, lng: -97.3308, km: 25, source: 'https://police.fortworthtexas.gov/Contact' },
  { key: 'san-jose-ca', area: 'San Jose, CA', agency: 'San Jose Police', dial: '408-277-8900', lat: 37.3382, lng: -121.8863, km: 20, source: 'https://www.sjpd.org/about-us/inside-sjpd/phone-directory' },
  { key: 'austin-tx', area: 'Austin, TX', agency: 'Austin Police', dial: '311', outside: '512-974-2000', lat: 30.2672, lng: -97.7431, km: 25, source: 'https://www.austintexas.gov/police' },
  { key: 'charlotte-nc', area: 'Charlotte, NC', agency: 'Charlotte-Mecklenburg Police', dial: '311', outside: '704-336-7600', lat: 35.2271, lng: -80.8431, km: 25, source: 'https://www.charlottenc.gov/cmpd/ePolicing-Resources/Non-Emergency-Police-Services' },
  { key: 'columbus-oh', area: 'Columbus, OH', agency: 'Columbus Police', dial: '614-645-4545', lat: 39.9612, lng: -82.9988, km: 20, source: 'https://columbus.gov/Services/Public-Safety/Police/About-the-Columbus-Division-of-Police/Contact-the-Division-of-Police' },
  { key: 'indianapolis-in', area: 'Indianapolis, IN', agency: 'Indianapolis Metropolitan Police', dial: '317-327-3811', lat: 39.7684, lng: -86.1581, km: 25, source: 'https://www.indy.gov/activity/marion-county-sheriff-resources' },
  { key: 'san-francisco-ca', area: 'San Francisco, CA', agency: 'San Francisco Police', dial: '415-553-0123', lat: 37.7749, lng: -122.4194, km: 10, source: 'https://www.sanfranciscopolice.org/contact-and-directory' },
  { key: 'oakland-ca', area: 'Oakland, CA', agency: 'Oakland Police', dial: '510-777-3333', lat: 37.8044, lng: -122.2712, km: 10, source: 'https://nixle.us/ET7W9' },
  { key: 'seattle-wa', area: 'Seattle, WA', agency: 'Seattle Police', dial: '206-625-5011', lat: 47.6062, lng: -122.3321, km: 15, source: 'https://seattle.gov/cscc/non-emergency-calls' },
  { key: 'denver-co', area: 'Denver, CO', agency: 'Denver Police', dial: '720-913-2000', lat: 39.7392, lng: -104.9903, km: 18, source: 'https://www.denvergov.org/Government/Agencies-Departments-Offices/Agencies-Departments-Offices-Directory/Police-Department/District-Stations' },
  { key: 'nashville-tn', area: 'Nashville, TN', agency: 'Metro Nashville Police', dial: '615-862-8600', lat: 36.1627, lng: -86.7816, km: 30, source: 'https://www.nashville.gov/departments/codes/people/branton-lamberth' },
  { key: 'las-vegas-nv', area: 'Las Vegas, NV', agency: 'Las Vegas Metropolitan Police', dial: '311', outside: '702-828-3111', lat: 36.1699, lng: -115.1398, km: 30, source: 'https://www.lvmpd.com/contact/contact-us' },
  { key: 'detroit-mi', area: 'Detroit, MI', agency: 'Detroit Police', dial: '313-267-4600', lat: 42.3314, lng: -83.0458, km: 18, source: 'https://detroitmi.gov/sites/detroitmi.localhost/files/2024-03/301.3-Telephone-Crime-Reporting_09-12-2022.pdf' },
  { key: 'portland-or', area: 'Portland, OR', agency: 'Portland Police', dial: '503-823-3333', lat: 45.5152, lng: -122.6784, km: 18, source: 'https://www.portland.gov/911/when-call-non-emergency-503-823-3333' },
  { key: 'louisville-ky', area: 'Louisville, KY', agency: 'Louisville Metro Police', dial: '502-574-7111', lat: 38.2527, lng: -85.7585, km: 25, source: 'https://www.lmpd.gov/faq' },
  { key: 'memphis-tn', area: 'Memphis, TN', agency: 'Memphis Police', dial: '901-545-2677', lat: 35.1495, lng: -90.049, km: 25, source: 'https://www.memphistn.gov/police' },
  { key: 'milwaukee-wi', area: 'Milwaukee, WI', agency: 'Milwaukee Police', dial: '414-933-4444', lat: 43.0389, lng: -87.9065, km: 18, source: 'https://city.milwaukee.gov/ImportantTelephoneNumbers' },
  { key: 'miami-fl', area: 'Miami, FL', agency: 'City of Miami Police', dial: '305-579-6111', lat: 25.7617, lng: -80.1918, km: 8, source: 'https://www.miami.gov/My-Government/Departments/Police-Department' },
  { key: 'new-orleans-la', area: 'New Orleans, LA', agency: 'New Orleans Police', dial: '504-821-2222', lat: 29.9511, lng: -90.0715, km: 18, source: 'https://nola.gov/nopd/contact-us' },
  { key: 'minneapolis-mn', area: 'Minneapolis, MN', agency: 'Minneapolis Police (via 311)', dial: '311', outside: '612-673-3000', lat: 44.9778, lng: -93.265, km: 12, source: 'https://minneapolismn.gov/government/departments/311/' },
  { key: 'atlanta-ga', area: 'Atlanta, GA', agency: 'Atlanta Police', dial: '404-658-6666', lat: 33.749, lng: -84.388, km: 15, source: 'https://www.atlantapd.org/' },
  { key: 'kansas-city-mo', area: 'Kansas City, MO', agency: 'Kansas City Police', dial: '816-234-5111', lat: 39.0997, lng: -94.5786, km: 25, source: 'https://kcpolice.org/crime/reporting-system-faqs' },
  { key: 'raleigh-nc', area: 'Raleigh, NC', agency: 'Raleigh Police', dial: '919-829-1911', lat: 35.7796, lng: -78.6382, km: 18, source: 'https://raleighnc.gov/POLICE' },
  { key: 'sacramento-ca', area: 'Sacramento, CA', agency: 'Sacramento Police', dial: '916-808-5471', lat: 38.5816, lng: -121.4944, km: 15, source: 'https://www.cityofsacramento.gov/police' },
  { key: 'tampa-fl', area: 'Tampa, FL', agency: 'Tampa Police', dial: '813-231-6130', lat: 27.9506, lng: -82.4572, km: 15, source: 'https://www.tampa.gov/sites/default/files/document/2023/d1_sector_a_0.pdf' },
  { key: 'orlando-fl', area: 'Orlando, FL', agency: 'Orlando Police', dial: '321-235-5300', lat: 28.5384, lng: -81.3789, km: 15, source: 'https://www.orlando.gov/Our-Government/Departments-Offices/Orlando-Police-Department/Contact-Us' },
  { key: 'pittsburgh-pa', area: 'Pittsburgh, PA', agency: 'Pittsburgh Police (via 311)', dial: '311', outside: '412-255-2621', lat: 40.4406, lng: -79.9959, km: 10, source: 'https://www.pittsburghpa.gov/Resident-Services/311' },
  { key: 'cleveland-oh', area: 'Cleveland, OH', agency: 'Cleveland Police', dial: '216-621-1234', lat: 41.4993, lng: -81.6944, km: 12, source: 'https://www.clevelandohio.gov/city-hall/departments/public-safety/divisions/police/when-call-or-text-911-police' },
  { key: 'cincinnati-oh', area: 'Cincinnati, OH', agency: 'Cincinnati Police', dial: '513-765-1212', lat: 39.1031, lng: -84.512, km: 12, source: 'https://www.cincinnati-oh.gov/311/info/police' },
  { key: 'salt-lake-city-ut', area: 'Salt Lake City, UT', agency: 'Salt Lake City Police', dial: '801-799-3000', lat: 40.7608, lng: -111.891, km: 12, source: 'https://police.slc.gov/contact-us/' },
  { key: 'albuquerque-nm', area: 'Albuquerque, NM', agency: 'Albuquerque Police', dial: '505-242-2677', lat: 35.0844, lng: -106.6504, km: 20, source: 'https://cabq.gov/311/abq311/emergencies' },
  { key: 'tucson-az', area: 'Tucson, AZ', agency: 'Tucson Police', dial: '520-791-4444', hours: '8am to 6pm', lat: 32.2226, lng: -110.9747, km: 20, source: 'https://www.tucsonaz.gov/Departments/Police/Contact-TPD' },
];

/** The app's own cities (profile setting) → the police line that covers them. */
const BY_APP_CITY: Record<string, string> = {
  'washington-dc': 'dc',
  'arlington-va': 'arlington-va',
  'alexandria-va': 'alexandria-va',
  'fairfax-va': 'fairfax-county-va',
  'tysons-va': 'fairfax-county-va',
  'mclean-va': 'fairfax-county-va',
  'falls-church-va': 'falls-church-va',
  'bethesda-md': 'montgomery-county-md',
  'silver-spring-md': 'montgomery-county-md',
  'rockville-md': 'montgomery-county-md',
  'college-park-md': 'prince-georges-md',
  'new-york-ny': 'new-york-ny',
  'chicago-il': 'chicago-il',
  'atlanta-ga': 'atlanta-ga',
};

export function lineForAppCity(slug: string | null | undefined) {
  const key = slug ? BY_APP_CITY[slug] : undefined;
  return POLICE_LINES.find((l) => l.key === key) ?? null;
}

function km(aLat: number, aLng: number, bLat: number, bLng: number) {
  const r = Math.PI / 180;
  const x = (bLng - aLng) * r * Math.cos(((aLat + bLat) / 2) * r);
  const y = (bLat - aLat) * r;
  return Math.sqrt(x * x + y * y) * 6371;
}

function inside(lat: number, lng: number, shape: [number, number][]) {
  let hit = false;
  for (let i = 0, j = shape.length - 1; i < shape.length; j = i++) {
    const [ay, ax] = shape[i] as [number, number];
    const [by, bx] = shape[j] as [number, number];
    if (ay > lat !== by > lat && lng < ((bx - ax) * (lat - ay)) / (by - ay) + ax) hit = !hit;
  }
  return hit;
}

/** The department covering this point: an outlined area first, else the closest one in range. Runs on the phone only. */
export function lineNear(lat: number, lng: number) {
  const outlined = POLICE_LINES.find((l) => l.shape && inside(lat, lng, l.shape));
  if (outlined) return outlined;
  let best: PoliceLine | null = null;
  let bestKm = Infinity;
  for (const l of POLICE_LINES) {
    if (l.shape) continue;
    const d = km(lat, lng, l.lat, l.lng);
    if (d <= l.km && d < bestKm) {
      best = l;
      bestKm = d;
    }
  }
  return best;
}

/** "703-558-2222", or "311 (from outside the city, 312-746-6000)". */
export function lineLabel(l: PoliceLine) {
  return l.outside ? `${l.dial} (outside the city, ${l.outside})` : l.dial;
}
