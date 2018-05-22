/**
 * Counts the substitutions needed to transform a into b
 * source adapted from: https://en.wikipedia.org/wiki/Levenshtein_distance#Iterative_with_two_matrix_rows
 * @param a first string
 * @param b seconds string
 */
export default function levenshteinDistance(a: string, b: string): number {
    if (a === b) {
        return 0;
    }

    if (a.length === 0) {
        return b.length;
    }

    if (b.length === 0) {
        return a.length;
    }

    let v0 = [];
    const v1 = [];

    for (let i = 0; i < b.length + 1; i++) {
        v0[i] = i;
        v1[i] = 0;
    }

    for (let i = 0; i < a.length; i++) {
        v1[0] = i + 1;

        for (let j = 0; j < b.length; j++) {
            const cost = a[i] === b[j] ? 0 : 1;

            const deletionCost = v0[j + 1] + 1;
            const insertCost = v1[j] + 1;
            const substituteCost = v0[j] + cost;
            const minCost = Math.min(Math.min(deletionCost, insertCost), substituteCost);

            v1[j + 1] = minCost;
        }
        v0 = v1.slice();
    }

    return v1[b.length];
}