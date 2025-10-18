/**
 * Hawaii Legislature Committee Codes
 */

export const SENATE_COMMITTEES = [
  "AEN", // Agriculture & Environment
  "CPN", // Commerce & Consumer Protection
  "EDU", // Education
  "EDT", // Economic Development & Tourism
  "EIG", // Energy & Intergovernmental Affairs
  "GVO", // Government Operations
  "HWN", // Hawaiian Affairs
  "HHS", // Health & Human Services
  "HRE", // Higher Education
  "HOU", // Housing
  "JDC", // Judiciary
  "LBT", // Labor & Technology
  "PSM", // Public Safety & Military Affairs
  "TCA", // Transportation & Culture & the Arts
  "WTL", // Water & Land
  "WAM"  // Ways & Means
] as const;

export const HOUSE_COMMITTEES = [
  "AGR", // Agriculture & Food Systems
  "CPC", // Consumer Protection & Commerce
  "CAA", // Culture & Arts
  "ECD", // Economic Development & Technology
  "EDN", // Education
  "EEP", // Energy & Environmental Protection
  "FIN", // Finance
  "HLT", // Health
  "HED", // Higher Education
  "HSG", // Housing
  "HSH", // Human Services & Homelessness
  "JHA", // Judiciary & Hawaiian Affairs
  "LAB", // Labor
  "LMG", // Legislative Management
  "PBS", // Public Safety
  "TOU", // Tourism
  "TRN", // Transportation
  "WAL"  // Water & Land
] as const;

export type Chamber = 'House' | 'Senate' | '';
export type SenateCommittee = typeof SENATE_COMMITTEES[number];
export type HouseCommittee = typeof HOUSE_COMMITTEES[number];
export type Committee = SenateCommittee | HouseCommittee;

/**
 * Get available committees based on chamber selection
 */
export const getCommitteesByChamber = (chamber: Chamber): readonly string[] => {
  if (chamber === 'Senate') return SENATE_COMMITTEES;
  if (chamber === 'House') return HOUSE_COMMITTEES;
  return [];
};
