import { settings, PilotError } from './_lib/layla/config.js';
import { owner } from './_lib/layla/owner.js';
import { checkMetaReadiness } from './_lib/layla/readiness.js';
import { send } from './_lib/http.js';

export function createHandler({ configuration=settings, sessionLookup, fetcher=fetch }={}) {
  return async (req,res) => {
    try {
      if (req.method !== 'GET') { res.setHeader('Allow','GET'); throw new PilotError('method',405); }
      const c=configuration();
      await owner(req,c,sessionLookup);
      const result=await checkMetaReadiness(c,fetcher);
      return send(res,200,{ok:true,...result},{vary:'Cookie'});
    } catch(error) {
      return send(res,error instanceof PilotError?error.status:503,
        {ok:false,reason:error instanceof PilotError?error.code:'unavailable'},{vary:'Cookie'});
    }
  };
}
export default createHandler();
