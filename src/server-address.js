const currentAddress = '15.235.180.174:25991';
const previousAddress = '51.79.162.71:28348';
const midtownJoinCode = 'dgx9dzy';

function statusJoinCode(connectAddress) {
  if (connectAddress === currentAddress || connectAddress === midtownJoinCode) return midtownJoinCode;
  return null;
}

// Saved settings may contain a host:port or a full FiveM status URL.
function migrateAddress(address) {
  if (!address) return address;
  const value = address.trim();
  const hostAndPath = value.replace(/^https?:\/\//i, '');
  if (hostAndPath.split('/')[0] !== previousAddress) return address;
  return value.replace(previousAddress, currentAddress);
}

module.exports = { currentAddress, migrateAddress, statusJoinCode };
