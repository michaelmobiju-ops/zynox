export async function picpayToken(clientId,clientSecret){
 if(!/^[\w-]{1,128}$/.test(clientId)||!/^\w{1,512}$/.test(clientSecret))throw Error("Credenciais inválidas.");
 const res=await fetch("https://ecommerce-api.svcp.ppay.me/sandbox/oauth2/token",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({grant_type:"client_credentials",client_id:clientId,client_secret:clientSecret}),redirect:"error",signal:AbortSignal.timeout(10000)});
 if(!res.ok)throw Error("Credenciais de homologação recusadas.");
 const d=await res.json();
 if(typeof d.access_token!=="string"||!d.access_token)throw Error("Token inválido.");
 return d.access_token;
}
export function verifyPicpayCharge(charge,reference,cents){
 return charge?.merchantChargeId===reference&&charge.chargeStatus==="PAID"&&charge.amount===cents&&Array.isArray(charge.transactions)&&charge.transactions.length===1&&charge.transactions[0].paymentType==="PIX"&&charge.transactions[0].transactionStatus==="PAID"&&charge.transactions[0].amount===cents;
}
