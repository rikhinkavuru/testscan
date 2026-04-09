export function stringSimilarity(s1: string, s2: string): number {
  let longer = s1;
  let shorter = s2;
  if (s1.length < s2.length) {
    longer = s2;
    shorter = s1;
  }
  const longerLength = longer.length;
  if (longerLength === 0) {
    return 1.0;
  }
  return (longerLength - editDistance(longer, shorter)) / parseFloat(longerLength.toString());
}

function editDistance(s1: string, s2: string): number {
  const costs = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else {
        if (j > 0) {
          let newValue = costs[j - 1];
          if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          }
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

export function wordOverlapSimilarity(s1: string, s2: string): number {
  if (!s1 || !s2) return 0;
  
  const words1 = Array.from(new Set(s1.toLowerCase().match(/\b\w+\b/g) || []));
  const words2 = Array.from(new Set(s2.toLowerCase().match(/\b\w+\b/g) || []));
  
  if (words1.length === 0 || words2.length === 0) return 0;

  const intersection = words1.filter(w => words2.includes(w)).length;
  const smallerLength = Math.min(words1.length, words2.length);

  // Measure how many words of the smaller question are present in the larger one
  return intersection / smallerLength;
}

