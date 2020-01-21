const alasql = require('alasql');
import * as types from "./types";

export class TokensStore {
    private constructor(private minutesToTokenExpiration: number) {
        alasql.fn.DIFF_SECOND = (start: Date, end: Date) => {
            if (start && end) {
                return (end.getTime() - start.getTime())/1000.0;
            } else {
                return null;
            }
        }
        alasql("CREATE TABLE apps_store (tenant_id string, client_id string, client_secret string, api_resource string, app_name string, token_acquired_time Date NULL,token_expire_time Date NULL, token_type string NULL, access_token string NULL, refresh_token string null)");
    }
    static get(minutesToTokenExpiration: number) {
        return new TokensStore(minutesToTokenExpiration);
    }
    initApp(appDef: types.AppDef) {
        const params = [
            appDef.tenant_id
            ,appDef.client_id
            ,appDef.client_secret
            ,appDef.api_resource
            ,appDef.app_name
            ,null, null, null, null, null
        ];
        alasql('INSERT INTO apps_store VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
        alasql("UPDATE apps_store SET token_acquired_time=null, token_expire_time=null WHERE tenant_id=? AND client_id=?", [appDef.tenant_id, appDef.client_id]);
    }
    getAppsThatNeedTokenRefresh() {
        const now = new Date();
        const sqlQuery = "SELECT tenant_id, client_id, refresh_token FROM apps_store WHERE refresh_token IS NOT NULL AND token_expire_time IS NOT NULL AND ? < token_expire_time AND DIFF_SECOND(?, token_expire_time) < ?";
        const result = alasql(sqlQuery, [now, now, this.minutesToTokenExpiration*60]) as {tenant_id: string, client_id: string, refresh_token: string}[];
        return result;     
    }
    getApp(tenant_id: string, client_id: string) {
        const ret = alasql("SELECT * FROM apps_store WHERE tenant_id=? AND client_id=?", [tenant_id, client_id])
        if (!ret || !ret[0]) throw "object not found";
        return ret[0] as types.App;
    }
    updateAppToken(tenant_id: string, client_id: string, tokenResponse: types.ADTokenResponse) {
        const now = new Date();
        const sqlUpdate = "UPDATE apps_store SET token_acquired_time=?, token_expire_time=?, token_type=?, access_token=?, refresh_token=? WHERE tenant_id=? AND client_id=?"
        const params: any[] = [
            now // token_acquired_time
            ,new Date(now.getTime() + tokenResponse.expires_in*1000.0)  // token_expire_time
            ,tokenResponse.token_type   // token_type
            ,tokenResponse.access_token // access_token
            ,tokenResponse.refresh_token   // refresh_token
            ,tenant_id
            ,client_id
        ];
        alasql(sqlUpdate, params);
    }
}