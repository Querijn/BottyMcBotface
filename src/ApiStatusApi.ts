import fetch from "node-fetch";

type RegionState = "up" | "troubled" | "down";

export interface RegionStatus {
    uptime: string;
    performance: string;
    state: RegionState;
}
export interface EndpointStatus {
    [key: string]: RegionStatus;
}

export interface APIStatus {
    [key: string]: EndpointStatus;
}

export default class ApiStatusApi {
    private apiUrl: string;
    private cached: APIStatus;
    private lastUpdate: number;
    private cacheDuration: number;

    public constructor(apiUrl: string, cacheDuration: number) {
        this.apiUrl = apiUrl;
        this.lastUpdate = 0;
        this.cacheDuration = cacheDuration;
    }

    public async getApiStatus(): Promise<APIStatus> {
        if (Date.now() - this.lastUpdate < this.cacheDuration) {
            return this.cached;
        }

        const resp = await fetch(this.apiUrl, {
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            method: "GET",
        });

        if (resp.status !== 200) {
            throw new Error(`[ApiStatus] Received status code ${resp.status}`);
        }

        this.cached = await resp.json();
        this.lastUpdate = Date.now();
        return this.cached;
    }
}
