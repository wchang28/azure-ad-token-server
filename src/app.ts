/* supports the follwoing env vars:
    APP_DEFS_FILE (required)
    EXTERNAL_HOST_URL (optional)
    PORT (optional)
    HOSTNAME (optional)
*/
import * as express from "express";
import * as types from "./types";
import * as fs from "fs";
import * as ip from "interval-polling";
import {TokensStore} from "./tokens-store";
import {AppTokenAcquisition} from "./token-acquisition";
import {Extension} from "./req-ext";
import * as http from "http";
import {jsonEndware, resourceLoadingMiddleware} from "./middleware-utils";
import * as jwtDecode from 'jwt-decode';

const MINUTES_TO_TOKEN_EXPIRATION = 10;
//const MINUTES_TO_TOKEN_EXPIRATION = 59;

const port = ((process.env.PORT as any) as number) || 8080;
const hostname = process.env.HOSTNAME || "127.0.0.1";

const externalHostUrl = process.env.EXTERNAL_HOST_URL || "http://localhost";
const EXTERNAL_BASE_URL = `${externalHostUrl}:${port}`;
console.log(`[${new Date().toISOString()}]: EXTERNAL_BASE_URL=${EXTERNAL_BASE_URL}`);

const appDefsFile = process.env.APP_DEFS_FILE;
if (!appDefsFile) {
    console.error(`[${new Date().toISOString()}]: env. var. APP_DEFS_FILE is required`);
    process.exit(1);
}

const appDefs = JSON.parse(fs.readFileSync(appDefsFile, "utf8")) as types.AppDef[];
console.log(`[${new Date().toISOString()}]: appDefs=\n${JSON.stringify(appDefs, null, 2)}`);

const app = express();

app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
	console.log('**********************************************************************');
	console.log(`[${new Date().toISOString()}]: incoming ${req.method} request from ${req.connection.remoteAddress}, url=${req.url}, headers: ${JSON.stringify(req.headers)}`);
	console.log('**********************************************************************');
	console.log('');
	next();
});

// no caching
/////////////////////////////////////////////////////////////////////////////////////////////////
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
	res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
	res.header('Expires', '-1');
	res.header('Pragma', 'no-cache');
	next();
});
/////////////////////////////////////////////////////////////////////////////////////////////////

// CORS initialization
/////////////////////////////////////////////////////////////////////////////////////////////////
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.header('Access-Control-Allow-Origin', '*');
    next();
});

app.options("/*", (req: express.Request, res: express.Response) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS,PATCH,HEAD');
    res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,Content-Length,X-Requested-With');
    res.send(200);
});
/////////////////////////////////////////////////////////////////////////////////////////////////

class AppKey {
    static get(tenant_id: string, client_id: string) {
        return `${tenant_id}/${client_id}`;
    }
}

const tokensStore = TokensStore.get(MINUTES_TO_TOKEN_EXPIRATION);

const appDefsMap: {[appKey: string]: types.AppDef} = {};
appDefs.forEach((appDef) => {  // for each app
    const appKey = AppKey.get(appDef.tenant_id, appDef.client_id);
    appDefsMap[appKey] = appDef;
    tokensStore.initApp(appDef);
});

const app_redirect_url_cb = (tenant_id: string, client_id: string) => {
    return `${EXTERNAL_BASE_URL}/app/${tenant_id}/${client_id}/auth`;
};

app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    req.extension = new Extension(tokensStore);
    res.retError = function(status: number, err: any) {
        const _this = (this) as express.Response;
        _this.errorObj = err;
        _this.status(status).json({error: http.STATUS_CODES[status], error_description: typeof err === "string" ? err : JSON.stringify(err)});
    }
    next();
});

async function extendApp(tokenAcquisition: AppTokenAcquisition, app: types.App) {
    const redirect_url = encodeURI(tokenAcquisition.redirect_url);
    const sign_in_url = await tokenAcquisition.getAppSignedInUrlForBrowser();
    const now = new Date();
    const token_expired = (app.token_expire_time ? now.getTime() >= new Date(app.token_expire_time).getTime() : null);
    const token_expired_minutes = (app.token_expire_time ? Math.round((new Date(app.token_expire_time).getTime() - now.getTime())/(1000 * 60)) : null);
    const hasToken = (app.token_type && app.access_token ? true : false);
    const has_valid_token = (token_expired == null ? false : token_expired ? false : hasToken);
    app.redirect_url = redirect_url;
    app.sign_in_url = sign_in_url;
    app.token_expired = token_expired;
    app.token_expired_minutes = token_expired_minutes;
    app.has_valid_token = has_valid_token;
    app.token_claims = (app.access_token ? jwtDecode(app.access_token) : null);
    return app;
}

const appRouter = express.Router();
app.use("/app", appRouter);

appRouter.get("/", jsonEndware(async (req) => {
    const ps = appDefs.map((appDef) => {
        const app = req.extension.tokensStore.getApp(appDef.tenant_id, appDef.client_id);
        return extendApp(new AppTokenAcquisition(appDef, app_redirect_url_cb), app);
    });
    const apps = await Promise.all(ps);
    return apps;
}));

const appObjRouter = express.Router();

appRouter.use("/:tenant_id/:client_id"
, resourceLoadingMiddleware(async (req) => {
    const tenant_id = req.params["tenant_id"];
    const client_id = req.params["client_id"];
    req.extension.app = req.extension.tokensStore.getApp(tenant_id, client_id);
    const appKey = AppKey.get(tenant_id, client_id);
    const appDef = appDefsMap[appKey];
    req.extension.tokenAcquisition = new AppTokenAcquisition(appDef, app_redirect_url_cb);
})
,appObjRouter);

const appObjEndware = jsonEndware(async (req) => await extendApp(req.extension.tokenAcquisition, req.extension.app));

appObjRouter.get("/", appObjEndware);

appObjRouter.get("/auth"
, resourceLoadingMiddleware(async (req) => {
    const code = req.query["code"] as string;
    const extension = req.extension;
    const tokenResponse = await extension.tokenAcquisition.getAccessTokenFromCode(code);
    const {tenant_id, client_id} = extension.app;
    extension.tokensStore.updateAppToken(tenant_id, client_id, tokenResponse);
    extension.app = req.extension.tokensStore.getApp(tenant_id, client_id);
})
, appObjEndware);

appObjRouter.get("/token", jsonEndware(async (req) => {
    const app = await extendApp(req.extension.tokenAcquisition, req.extension.app);
    return (app.has_valid_token ? {token_type: app.token_type, access_token: app.access_token} : null);
}));

const appTokensRefresher = ip.Polling.get(async () => {
    const apps = tokensStore.getAppsThatNeedTokenRefresh();
    if (apps.length > 0) {
        console.log(`[${new Date().toISOString()}]: apps need to refresh access token: ${JSON.stringify(apps.map(({app_name}) => app_name))}`);
        const failedApps: string[] = [];
        const ps = apps.map(async ({tenant_id, client_id, refresh_token, app_name}) => {
            try {
                const appKey = AppKey.get(tenant_id, client_id);
                const appDef = appDefsMap[appKey];
                const tokenAcq = new AppTokenAcquisition(appDef, app_redirect_url_cb);
                const tokenResponse = await tokenAcq.refreshToken(refresh_token);
                if (!tokenResponse || !tokenResponse.access_token || !tokenResponse.refresh_token) {
                    throw `error refreshing access token for app ${app_name}`;
                }
                tokensStore.updateAppToken(tenant_id, client_id, tokenResponse);
            } catch(e) {
                failedApps.push(app_name);
                console.error(`[${new Date().toISOString()}]: ${e}`);
            }
        });
        await Promise.all(ps);
        if (failedApps.length === 0) {
            console.log(`[${new Date().toISOString()}]: all tokens refreshed successfully :)`);
        } else {
            console.error(`[${new Date().toISOString()}]: apps failed to refresh access token: ${JSON.stringify(failedApps)}`);
        }
    } else {
        console.log(`[${new Date().toISOString()}]: no app needs to refresh access token`);
    }
}, 30);

appTokensRefresher.start();

// start the app service
app.listen(port, hostname, () => {
    console.log(`[${new Date().toISOString()}]: app server listening on port ${hostname}:${port} :-)`);
});