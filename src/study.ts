export type Study = {
    id: string | undefined | null;
    title: string | undefined | null,
    researcher: string | undefined | null,
    places: number | undefined | null;
    reward: number | undefined | null;
    rewardPerHour: number | undefined | null;
    time: number | undefined | null;
    limitedCapacity: boolean | undefined | null;
};