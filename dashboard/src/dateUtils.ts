// <input type="datetime-local"> works in "YYYY-MM-DDTHH:mm" with no timezone.
// The dashboard treats every value the user types as UTC directly (labelled
// as such in the UI) rather than converting through the browser's local
// timezone, since the API only accepts UTC and that round-trip is a common
// source of off-by-one-hour bugs for no real benefit here.
export function toApiDateTime(inputValue: string): string {
  return `${inputValue}:00Z`;
}

export function toInputValue(isoDateTime: string): string {
  return isoDateTime.slice(0, 16);
}
