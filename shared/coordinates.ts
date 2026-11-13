// Decimal degrees only: never guess a missing decimal separator or swap axes.
export function parseCoordinate(value:string,limit:90|180):number|null {
 const text=value.trim().replace(/^−/,'-');
 if(!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(text))return null;
 const n=Number(text.replace(',','.'));
 return Number.isFinite(n)&&Math.abs(n)<=limit?Number(n.toFixed(7)):null;
}

// A comma between values requires decimal points; decimal commas require whitespace.
export function parseCoordinatePair(value: string): {latitude:number; longitude:number} | null {
 const input = value.trim();
 let parts = input.split(/\s+/);
 if (parts.length === 2 && parts[0].endsWith(',')) parts[0] = parts[0].slice(0,-1);
 if (parts.length === 1) parts = input.split(',');
 if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
 const latitude = parseCoordinate(parts[0],90), longitude = parseCoordinate(parts[1],180);
 return latitude === null || longitude === null ? null : {latitude,longitude};
}
