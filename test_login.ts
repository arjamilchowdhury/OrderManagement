async function test() {
  const res = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: '1914551025@uits.edu.bd', password: 'password' })
  });
  console.log(res.status);
  console.log(await res.json());
}
test();
