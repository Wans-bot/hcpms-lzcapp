/* HC 智慧物业 · 懒猫免密登录注入
 *
 * 背景：HC 的 Web 登录接口只在请求头 app-id = WEB_APP_ID(8000418004) 时校验图形验证码；
 * 用物业员工应用 ID(992020022270580001) 调用同一接口不校验验证码，返回的 token 对
 * web app-id 的业务接口同样有效（两者都实测过）。
 *
 * 做法：页面加载后若 localStorage 没有 token，就用员工 app-id 登录内置账号，
 * 写入 token / user / 特权 / 小区信息（与登录页 handleSelect 的写入项一致），再跳回首页。
 * 登录页会在 created() 里 localStorage.clear()，所以写完后立刻整页跳转离开登录页，并做一次校验重试。
 */
(function () {
  var STAFF_APP_ID = '992020022270580001';
  var USER = 'admin';
  var PASS = 'admin';
  var APP = '/app';

  function headers(appId, withAuth) {
    var h = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'app-id': appId,
      'TRANSACTION-ID': 'lzc-' + Date.now() + '-' + Math.random().toString(16).slice(2),
      'REQ-TIME': ts(),
      'user-id': '-1'
    };
    var t = localStorage.getItem('token');
    if (withAuth && t) h['Authorization'] = 'Bearer ' + t;
    return h;
  }

  function ts() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }

  function get(url) {
    return fetch(APP + url, { headers: headers('8000418004', true), credentials: 'same-origin' }).then(function (r) { return r.json(); });
  }

  function doLogin() {
    return fetch(APP + '/login.pcUserLogin', {
      method: 'POST',
      headers: headers(STAFF_APP_ID, false),
      credentials: 'same-origin',
      body: JSON.stringify({ username: USER, passwd: PASS })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || j.code !== 0 || !j.data || !j.data.length) return null;
      var u = j.data[0];
      localStorage.setItem('token', u.token);
      localStorage.setItem('user', JSON.stringify({ userId: u.userId, name: u.name, tel: u.tel }));
      return u;
    });
  }

  function seed() {
    return get('/query.user.privilege').then(function (p) {
      if (p && p.datas) localStorage.setItem('hc_staff_privilege', JSON.stringify(p.datas.map(function (i) { return i.pId; })));
    }).catch(function () {}).then(function () {
      return get('/community.listMyEnteredCommunitys?page=1&row=3').then(function (c) {
        if (c && c.communitys && c.communitys.length) {
          localStorage.setItem('hc_communityInfos', JSON.stringify(c.communitys));
          if (!localStorage.getItem('hc_currentCommunityInfo')) {
            localStorage.setItem('hc_currentCommunityInfo', JSON.stringify(c.communitys[0]));
          }
        }
      });
    }).catch(function () {});
  }

  function run(attempt) {
    if (localStorage.getItem('token')) return;
    doLogin().then(function (u) {
      if (!u) return;
      return seed().then(function () {
        // 登录页 created() 会 clear()，写入后立即校验并离开登录页
        if (!localStorage.getItem('token')) {
          if (attempt < 3) return setTimeout(function () { run(attempt + 1); }, 400);
          return;
        }
        location.replace('/');
      });
    }).catch(function () { });
  }

  // 等登录页的 created() 清空动作先跑完，再写入并跳转
  setTimeout(function () { run(0); }, 600);
})();
