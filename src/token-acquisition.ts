import * as types from "./types";
import * as request from "superagent";

export class AppTokenAcquisition {
    constructor(private appDef: {tenant_id: string, client_id: string, client_secret: string, api_resource: string}, private redirect_url_cb: (tenant_id: string, client_id: string) => string) {
    }
    private get tenant_id() {
        return this.appDef.tenant_id;
    }
    private get client_id() {
        return this.appDef.client_id;
    }
    private get client_secret() {
        return this.appDef.client_secret;
    }
    private get scope() {
		// openid: Required for OIDC. Requests an ID token and includes the sub claim (subject identifier).
		// profile: Includes basic profile information such as name, family_name, given_name, preferred_username in the claim.
		// email: Includes the user's email address (email claim).
		// offline_access: (Microsoft-specific) Requests a refresh token so your app can get new tokens without user interaction.
        return `openid profile email offline_access ${this.appDef.api_resource}/.default`;
    }
    public get redirect_url() {
        return this.redirect_url_cb(this.tenant_id, this.client_id);
    }
    async getOpenIDMetadata() {
        const response = await request.get(`https://login.microsoftonline.com/${this.tenant_id}/v2.0/.well-known/openid-configuration`)
        return JSON.parse(response.text) as types.OpenIDMetadata;
    }
    public async getAppSignedInUrlForBrowser() {
        const metaData = await this.getOpenIDMetadata();
        let url = `${metaData.authorization_endpoint}`;
        url += "?" + `client_id=${this.client_id}`;
        url += "&" + "response_type=code";
        url += "&" + `redirect_uri=${this.redirect_url}`;
        url += "&" + "response_mode=query";
        url += "&" + `scope=${this.scope}`;
        //url += "&" + `prompt=consent`;
        url = encodeURI(url);
        return url;
    }
    async getAccessTokenFromCode(code: string) {
        const metaData = await this.getOpenIDMetadata();
        const response = await request.post(metaData.token_endpoint)
        .type('form')
        .send({
            client_id: this.client_id
            ,scope: this.scope
            ,code
            ,redirect_uri: this.redirect_url
            ,grant_type: "authorization_code"
            ,client_secret: this.client_secret
        });
        return JSON.parse(response.text) as types.ADTokenResponse;
    }
    async refreshToken(refresh_token: string) {
        const metaData = await this.getOpenIDMetadata();
        const response = await request.post(metaData.token_endpoint)
        .type('form')
        .send({
            client_id: this.client_id
            ,scope: this.scope
            ,refresh_token
            ,grant_type: "refresh_token"
            ,client_secret: this.client_secret
        });
        //console.log(`refresh_token.response=\n${response.text}`);
        return JSON.parse(response.text) as types.ADTokenResponse;
    }
}