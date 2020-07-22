export interface AppDef {
    tenant_id: string;
    client_id: string;
    client_secret: string;
    api_resource: string;
    app_name: string;
}

export interface OpenIDMetadata {
    token_endpoint: string;
    authorization_endpoint: string;
}

export interface ADTokenResponse {
    token_type: string;
    access_token: string;
    scope: string;
    refresh_token?: string;
    expires_in: number; // in seconds
    id_token?: string;
}

export interface App extends AppDef {
    token_acquired_time?: Date | string;
    token_expire_time?: Date | string;
    token_type?: string
    access_token?: string;
    refresh_token?: string;

    redirect_url?: string;
    sign_in_url?: string;
    token_expired?: boolean;
    token_expired_minutes?: number;
    has_valid_token?: boolean;
    token_claims?: any;
}