export type RecordCreatorMap = Record<string, string>;

export function normaliseRecordCreatorMap(value: unknown): RecordCreatorMap;
export function creatorMapForCloudRows(rows: unknown, records: unknown): RecordCreatorMap;
export function retainRecordCreatorsForRecords(creators: unknown, records: unknown): RecordCreatorMap;
