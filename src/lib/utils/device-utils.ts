
export const normalizeHexId = (id: string | number): string => {
  if (!id) return "";
  
  let normalizedId = id.toString().replace(/^0x/i, '');
  
  if (normalizedId.length >= 4) {
    return normalizedId;
  }
  
  while (normalizedId.length < 4) {
    normalizedId = '0' + normalizedId;
  }
  
  return normalizedId;
};

export const detectClientOS = (): string => {
  const userAgent = navigator.userAgent.toLowerCase();
  
  if (userAgent.indexOf('win') !== -1) return 'win32';
  if (userAgent.indexOf('mac') !== -1) return 'darwin';
  if (userAgent.indexOf('linux') !== -1) return 'linux';
  
  return 'unknown';
};

export const logIdProcessing = (type: string, original: string | number, normalized: string): void => {
  console.log(`${type} ID conversion: Original=${original}, Normalized=${normalized}`);
};
