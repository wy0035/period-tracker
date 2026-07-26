/* ============================================================
 * 经期工作台 · Period Tracker
 * 数据模型 + 业务逻辑 + UI 渲染
 * ============================================================ */
(function () {
  'use strict';

  // ---------- 常量 ----------
  var STORAGE_KEY = 'period_tracker_records_v1';
  var DOW = ['日', '一', '二', '三', '四', '五', '六'];
  var MONTH_CN = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
  var FLOW_LABEL = { light: '量少', normal: '正常', heavy: '量多' };

  // ---------- 状态 ----------
  var state = {
    records: [],          // 所有记录，按开始日期升序
    editId: null,         // 当前编辑的记录 id
    selectedFlow: null,
    selectedSymptoms: [],
    calYear: new Date().getFullYear(),
    calMonth: new Date().getMonth(),
    charts: { trend: null, symptoms: null }
  };

  // ---------- 工具函数 ----------
  function $ (id) { return document.getElementById(id); }
  function todayStr () { return fmtDate(new Date()); }
  function fmtDate (d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }
  function parseDate (s) {
    // s: 'YYYY-MM-DD' -> Date (local)
    var parts = s.split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  function daysBetween (a, b) {
    return Math.round((parseDate(b) - parseDate(a)) / 86400000);
  }
  function addDays (s, n) {
    var d = parseDate(s);
    d.setDate(d.getDate() + n);
    return fmtDate(d);
  }
  function uid () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function toast (msg, type) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'toast show' + (type ? ' ' + type : '');
    setTimeout(function () { t.className = 'toast'; }, 2400);
  }

  // ---------- 数据持久化 ----------
  function loadRecords () {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) { state.records = []; return; }
      state.records = JSON.parse(raw) || [];
    } catch (e) {
      state.records = [];
    }
  }
  function saveRecords () {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.records));
  }
  function sortRecords () {
    state.records.sort(function (a, b) {
      return a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0;
    });
  }

  // ---------- 业务计算 ----------
  // 计算每条记录的经期天数与（非首条）周期长度
  function enrichRecords () {
    state.records.forEach(function (r, i) {
      r.periodDays = r.endDate ? daysBetween(r.startDate, r.endDate) + 1 : null;
      if (i > 0) {
        r.cycleLength = daysBetween(state.records[i - 1].startDate, r.startDate);
      } else {
        r.cycleLength = null;
      }
    });
  }

  function avgCycleLength () {
    var vals = state.records.slice(1).map(function (r) { return r.cycleLength; }).filter(function (v) { return v && v > 0; });
    if (!vals.length) return null;
    return Math.round(vals.reduce(function (a, b) { return a + b; }, 0) / vals.length);
  }
  function avgPeriodDays () {
    var vals = state.records.map(function (r) { return r.periodDays; }).filter(function (v) { return v && v > 0; });
    if (!vals.length) return null;
    return Math.round(vals.reduce(function (a, b) { return a + b; }, 0) / vals.length * 10) / 10;
  }

  // 预测下次经期开始日 = 最后一条记录开始日 + 平均周期长度
  function predictNextStart () {
    if (state.records.length < 2) return null;
    var last = state.records[state.records.length - 1];
    var avg = avgCycleLength();
    if (!last || !avg) return null;
    return addDays(last.startDate, avg);
  }
  // 预测下次经期结束日
  function predictNextEnd () {
    var start = predictNextStart();
    if (!start) return null;
    var avgP = avgPeriodDays();
    if (!avgP) return null;
    return addDays(start, Math.round(avgP) - 1);
  }
  // 排卵日预测 = 下次经期开始前 14 天
  function predictOvulation () {
    var next = predictNextStart();
    if (!next) return null;
    return addDays(next, -14);
  }
  // 易孕期 = 排卵日前 5 天 ~ 排卵日后 1 天
  function fertileWindow () {
    var ov = predictOvulation();
    if (!ov) return null;
    return { start: addDays(ov, -5), end: addDays(ov, 1), ovulation: ov };
  }

  // ---------- 渲染：概览卡片 ----------
  function renderOverview () {
    var next = predictNextStart();
    var nextEnd = predictNextEnd();
    var avgC = avgCycleLength();
    var avgP = avgPeriodDays();

    if (next) {
      var d = parseDate(next);
      $('statNext').innerHTML = (d.getMonth() + 1) + '/' + d.getDate() + '<span class="unit"></span>';
      $('statNextSub').textContent = nextEnd ? ('预计 ' + next + ' 至 ' + nextEnd) : next;
    } else {
      $('statNext').innerHTML = '—<span class="unit"></span>';
      $('statNextSub').textContent = '至少需要 2 条记录';
    }

    $('statCycle').innerHTML = (avgC || '—') + '<span class="unit">天</span>';
    $('statCycleSub').textContent = state.records.length > 1
      ? ('基于 ' + (state.records.length - 1) + ' 个间隔')
      : '至少需要 2 条记录';

    $('statPeriod').innerHTML = (avgP || '—') + '<span class="unit">天</span>';
    $('statPeriodSub').textContent = state.records.length
      ? ('基于 ' + state.records.length + ' 条记录')
      : '暂无记录';

    if (next) {
      var diff = daysBetween(todayStr(), next);
      if (diff > 0) {
        $('statCountdown').innerHTML = diff + '<span class="unit">天</span>';
        $('statCountdownSub').textContent = '经期即将到来';
      } else if (diff === 0) {
        $('statCountdown').innerHTML = '今天<span class="unit"></span>';
        $('statCountdownSub').textContent = '经期预计今天开始';
      } else {
        $('statCountdown').innerHTML = Math.abs(diff) + '<span class="unit">天前</span>';
        $('statCountdownSub').textContent = '已过预测日，请记录';
      }
    } else {
      $('statCountdown').innerHTML = '—<span class="unit">天</span>';
      $('statCountdownSub').textContent = '—';
    }
  }

  // ---------- 渲染：历史记录 ----------
  function renderHistory () {
    var list = $('historyList');
    $('historyCount').textContent = state.records.length + ' 条记录';
    if (!state.records.length) {
      list.innerHTML = '<div class="empty-state"><div class="emoji">🌷</div><p>还没有记录<br>点击「记录经期」开始</p></div>';
      return;
    }
    var html = '';
    // 倒序展示
    for (var i = state.records.length - 1; i >= 0; i--) {
      var r = state.records[i];
      var d = parseDate(r.startDate);
      var title = (d.getMonth() + 1) + '月经期';
      var desc = r.startDate + (r.endDate ? ' ~ ' + r.endDate : '');
      if (r.periodDays) desc += ' · ' + r.periodDays + ' 天';
      if (r.cycleLength) desc += ' · 周期 ' + r.cycleLength + ' 天';
      var tags = '';
      if (r.flow) tags += '<span class="tag flow">' + (FLOW_LABEL[r.flow] || r.flow) + '</span>';
      (r.symptoms || []).forEach(function (s) { tags += '<span class="tag">' + s + '</span>'; });
      if (r.notes) tags += '<span class="tag">备注</span>';
      html += ''
        + '<div class="history-item">'
        + '  <div class="history-date"><div class="month">' + (d.getMonth() + 1) + '月</div><div class="day">' + d.getDate() + '</div></div>'
        + '  <div class="history-info">'
        + '    <div class="title">' + title + '</div>'
        + '    <div class="desc">' + desc + '</div>'
        + '    <div class="tags">' + tags + '</div>'
        + '  </div>'
        + '  <div class="history-actions">'
        + '    <button class="icon-btn" data-edit="' + r.id + '" title="编辑">✎</button>'
        + '    <button class="icon-btn delete" data-del="' + r.id + '" title="删除">🗑</button>'
        + '  </div>'
        + '</div>';
    }
    list.innerHTML = html;

    // 绑定事件
    list.querySelectorAll('[data-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () { openEdit(btn.getAttribute('data-edit')); });
    });
    list.querySelectorAll('[data-del]').forEach(function (btn) {
      btn.addEventListener('click', function () { deleteRecord(btn.getAttribute('data-del')); });
    });
  }

  // ---------- 渲染：日历 ----------
  function renderCalendar () {
    var grid = $('calendarGrid');
    $('calMonthLabel').textContent = state.calYear + '年 ' + MONTH_CN[state.calMonth];

    // 收集当月需标记的日期
    var marks = {}; // 'YYYY-MM-DD' -> type
    var today = todayStr();

    // 真实经期
    state.records.forEach(function (r) {
      if (!r.endDate) return;
      var cur = r.startDate;
      while (cur <= r.endDate) {
        marks[cur] = 'period';
        cur = addDays(cur, 1);
      }
    });
    // 只有开始日期的记录也算经期当天
    state.records.forEach(function (r) {
      if (r.endDate) return;
      if (!marks[r.startDate]) marks[r.startDate] = 'period';
    });

    // 预测下次经期
    var pnStart = predictNextStart();
    var pnEnd = predictNextEnd();
    if (pnStart && pnEnd) {
      var cur = pnStart;
      while (cur <= pnEnd) {
        if (!marks[cur]) marks[cur] = 'predicted';
        cur = addDays(cur, 1);
      }
    }
    // 易孕期 + 排卵日
    var fw = fertileWindow();
    if (fw) {
      var c = fw.start;
      while (c <= fw.end) {
        if (!marks[c]) marks[c] = (c === fw.ovulation) ? 'ovulation' : 'fertile';
        c = addDays(c, 1);
      }
    }

    // 构建日历
    var firstDay = new Date(state.calYear, state.calMonth, 1);
    var startWeekday = firstDay.getDay();
    var daysInMonth = new Date(state.calYear, state.calMonth + 1, 0).getDate();

    var html = '';
    DOW.forEach(function (d) { html += '<div class="dow">' + d + '</div>'; });
    for (var i = 0; i < startWeekday; i++) html += '<div class="cal-day empty"></div>';
    for (var day = 1; day <= daysInMonth; day++) {
      var ds = fmtDate(new Date(state.calYear, state.calMonth, day));
      var cls = 'cal-day';
      var mark = marks[ds];
      if (mark) cls += ' ' + mark;
      if (ds === today) cls += ' today';
      html += '<div class="' + cls + '" title="' + ds + (mark ? ' · ' + mark : '') + '">' + day + '</div>';
    }
    grid.innerHTML = html;
  }

  // ---------- 渲染：图表 ----------
  function renderCharts () {
    var style = getComputedStyle(document.documentElement);
    var accent = style.getPropertyValue('--accent').trim();
    var accent2 = style.getPropertyValue('--accent2').trim();
    var ink = style.getPropertyValue('--ink').trim();
    var muted = style.getPropertyValue('--muted').trim();
    var rule = style.getPropertyValue('--rule').trim();
    var bg2 = style.getPropertyValue('--bg2').trim();

    // 趋势图：折线 双 Y 轴
    var trendEl = $('chartTrend');
    if (state.charts.trend) { state.charts.trend.dispose(); state.charts.trend = null; }
    if (state.records.length === 0) {
      trendEl.innerHTML = '<div class="empty-state"><div class="emoji">📊</div><p>暂无数据可绘制</p></div>';
    } else {
      state.charts.trend = echarts.init(trendEl, null, { renderer: 'svg' });
      var labels = state.records.map(function (r, i) {
        return '#' + (i + 1) + ' ' + r.startDate.slice(5);
      });
      var cycleData = state.records.map(function (r) { return r.cycleLength; });
      var periodData = state.records.map(function (r) { return r.periodDays; });
      state.charts.trend.setOption({
        tooltip: { trigger: 'axis', appendToBody: true },
        legend: {
          data: ['周期长度', '经期天数'],
          top: 0, textStyle: { color: muted, fontSize: 12 }
        },
        grid: { left: 40, right: 40, top: 40, bottom: 30, containLabel: true },
        xAxis: {
          type: 'category', data: labels,
          axisLine: { lineStyle: { color: rule } },
          axisLabel: { color: muted, fontSize: 11, rotate: labels.length > 6 ? 30 : 0 }
        },
        yAxis: [
          {
            type: 'value', name: '周期长度(天)', nameTextStyle: { color: muted, fontSize: 11 },
            axisLine: { show: false }, splitLine: { lineStyle: { color: rule } },
            axisLabel: { color: muted, fontSize: 11 }
          },
          {
            type: 'value', name: '经期天数(天)', nameTextStyle: { color: muted, fontSize: 11 },
            axisLine: { show: false }, splitLine: { show: false },
            axisLabel: { color: muted, fontSize: 11 }
          }
        ],
        series: [
          {
            name: '周期长度', type: 'line', smooth: true, data: cycleData,
            itemStyle: { color: accent }, lineStyle: { width: 3, color: accent },
            areaStyle: { color: accent + '22' },
            connectNulls: true
          },
          {
            name: '经期天数', type: 'bar', yAxisIndex: 1, data: periodData,
            itemStyle: { color: accent2, borderRadius: [4, 4, 0, 0] },
            barWidth: '40%'
          }
        ],
        animation: false
      });
      window.addEventListener('resize', function () { if (state.charts.trend) state.charts.trend.resize(); });
    }

    // 症状统计：横向条形图
    var symEl = $('chartSymptoms');
    if (state.charts.symptoms) { state.charts.symptoms.dispose(); state.charts.symptoms = null; }
    var symCount = {};
    state.records.forEach(function (r) {
      (r.symptoms || []).forEach(function (s) { symCount[s] = (symCount[s] || 0) + 1; });
    });
    var symNames = Object.keys(symCount);
    if (symNames.length === 0) {
      symEl.innerHTML = '<div class="empty-state"><div class="emoji">🌡️</div><p>暂无症状记录</p></div>';
    } else {
      symNames.sort(function (a, b) { return symCount[b] - symCount[a]; });
      var symData = symNames.map(function (n) { return symCount[n]; });
      state.charts.symptoms = echarts.init(symEl, null, { renderer: 'svg' });
      state.charts.symptoms.setOption({
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, appendToBody: true },
        grid: { left: 10, right: 40, top: 20, bottom: 10, containLabel: true },
        xAxis: {
          type: 'value', minInterval: 1,
          axisLine: { show: false }, splitLine: { lineStyle: { color: rule } },
          axisLabel: { color: muted, fontSize: 11 }
        },
        yAxis: {
          type: 'category', data: symNames,
          axisLine: { lineStyle: { color: rule } },
          axisLabel: { color: ink, fontSize: 12 }
        },
        series: [{
          type: 'bar', data: symData,
          itemStyle: {
            color: { type: 'linear', x: 0, y: 0, x2: 1, y2: 0,
              colorStops: [{ offset: 0, color: accent }, { offset: 1, color: accent2 }] },
            borderRadius: [0, 6, 6, 0]
          },
          barWidth: '55%', label: { show: true, position: 'right', color: ink, fontSize: 12 }
        }],
        animation: false
      });
      window.addEventListener('resize', function () { if (state.charts.symptoms) state.charts.symptoms.resize(); });
    }
  }

  // ---------- 渲染：时间线 ----------
  function renderTimeline () {
    var tl = $('timeline');
    if (state.records.length === 0) {
      tl.innerHTML = '<div class="empty-state"><div class="emoji">⏱️</div><p>暂无周期数据</p></div>';
      return;
    }
    var html = '';
    // 最近 6 个周期（倒序）
    var recent = state.records.slice(-6).reverse();
    recent.forEach(function (r) {
      var d = parseDate(r.startDate);
      var dateStr = (d.getMonth() + 1) + '月' + d.getDate() + '日';
      var desc = '经期 ' + (r.periodDays || '?') + ' 天';
      if (r.cycleLength) desc += ' · 上次间隔 ' + r.cycleLength + ' 天';
      if (r.flow) desc += ' · ' + (FLOW_LABEL[r.flow] || r.flow);
      html += ''
        + '<div class="timeline-item">'
        + '  <div class="tl-date">' + dateStr + ' <span class="tl-badge">已记录</span></div>'
        + '  <div class="tl-desc">' + desc + '</div>'
        + '</div>';
    });
    // 预测下次
    var pn = predictNextStart();
    if (pn) {
      var d = parseDate(pn);
      var diff = daysBetween(todayStr(), pn);
      var badge = diff > 0 ? ('还有 ' + diff + ' 天') : (diff === 0 ? '今天' : ('已过 ' + Math.abs(diff) + ' 天'));
      html += ''
        + '<div class="timeline-item predicted">'
        + '  <div class="tl-date">' + (d.getMonth() + 1) + '月' + d.getDate() + '日 <span class="tl-badge">预测下次</span></div>'
        + '  <div class="tl-desc">预计经期开始 · ' + badge + '</div>'
        + '</div>';
    }
    tl.innerHTML = html;
  }

  // ---------- 表单 ----------
  function resetForm () {
    state.editId = null;
    state.selectedFlow = null;
    state.selectedSymptoms = [];
    $('periodForm').reset();
    $('recordId').value = '';
    $('startDate').value = todayStr();
    $('endDate').value = '';
    $('notes').value = '';
    $('formMode').textContent = '新增记录';
    document.querySelectorAll('.flow-chip').forEach(function (c) { c.classList.remove('active'); });
    document.querySelectorAll('.symptom-tag').forEach(function (c) { c.classList.remove('active'); });
  }

  function openEdit (id) {
    var r = state.records.find(function (x) { return x.id === id; });
    if (!r) return;
    state.editId = id;
    $('recordId').value = r.id;
    $('startDate').value = r.startDate;
    $('endDate').value = r.endDate || '';
    $('notes').value = r.notes || '';
    state.selectedFlow = r.flow || null;
    state.selectedSymptoms = (r.symptoms || []).slice();
    document.querySelectorAll('.flow-chip').forEach(function (c) {
      c.classList.toggle('active', c.getAttribute('data-flow') === state.selectedFlow);
    });
    document.querySelectorAll('.symptom-tag').forEach(function (c) {
      var s = c.getAttribute('data-symptom');
      c.classList.toggle('active', state.selectedSymptoms.indexOf(s) !== -1);
    });
    $('formMode').textContent = '编辑记录';
    // 滚动到表单
    $('formCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function submitForm (e) {
    e.preventDefault();
    var startDate = $('startDate').value;
    var endDate = $('endDate').value;
    if (!startDate) { toast('请选择开始日期', 'error'); return; }
    if (endDate && endDate < startDate) { toast('结束日期不能早于开始日期', 'error'); return; }

    var rec = {
      id: state.editId || uid(),
      startDate: startDate,
      endDate: endDate || '',
      flow: state.selectedFlow || '',
      symptoms: state.selectedSymptoms.slice(),
      notes: $('notes').value.trim(),
      createdAt: state.editId
        ? (state.records.find(function (r) { return r.id === state.editId; }) || {}).createdAt || Date.now()
        : Date.now()
    };

    if (state.editId) {
      var idx = state.records.findIndex(function (r) { return r.id === state.editId; });
      if (idx !== -1) state.records[idx] = rec;
      toast('记录已更新', 'success');
    } else {
      state.records.push(rec);
      toast('记录已保存', 'success');
    }
    sortRecords();
    enrichRecords();
    saveRecords();
    resetForm();
    renderAll();
  }

  function deleteRecord (id) {
    var r = state.records.find(function (x) { return x.id === id; });
    if (!r) return;
    if (!confirm('确定删除 ' + r.startDate + ' 的经期记录吗？')) return;
    state.records = state.records.filter(function (x) { return x.id !== id; });
    saveRecords();
    enrichRecords();
    renderAll();
    toast('记录已删除', 'success');
  }

  // ---------- 全量渲染 ----------
  function renderAll () {
    enrichRecords();
    renderOverview();
    renderHistory();
    renderCalendar();
    renderCharts();
    renderTimeline();
  }

  // ---------- 示例数据 ----------
  function loadSample () {
    var samples = [];
    var base = new Date();
    base.setMonth(base.getMonth() - 5);
    var cycleLens = [28, 30, 27, 29, 28];
    var periodLens = [5, 6, 4, 5, 5];
    var flows = ['normal', 'heavy', 'light', 'normal', 'normal'];
    var symptomsList = [
      ['痛经', '腰酸'],
      ['头痛', '情绪波动', '疲劳'],
      ['乳房胀痛'],
      ['痛经', '痤疮'],
      ['疲劳', '失眠']
    ];
    var curStart = fmtDate(base);
    for (var i = 0; i < 5; i++) {
      samples.push({
        id: uid(),
        startDate: curStart,
        endDate: addDays(curStart, periodLens[i] - 1),
        flow: flows[i],
        symptoms: symptomsList[i],
        notes: i === 2 ? '本月压力较大，周期偏短' : '',
        createdAt: Date.now() + i
      });
      curStart = addDays(curStart, cycleLens[i]);
    }
    state.records = samples;
    sortRecords();
    enrichRecords();
    saveRecords();
    renderAll();
    toast('示例数据已加载', 'success');
  }

  // ---------- 数据导入导出 ----------
  function exportData () {
    if (state.records.length === 0) { toast('没有数据可导出', 'error'); return; }
    var blob = new Blob([JSON.stringify(state.records, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'period-records-' + todayStr() + '.json';
    a.click();
    URL.revokeObjectURL(url);
    toast('已导出 ' + state.records.length + ' 条记录', 'success');
  }
  function importData (file) {
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var data = JSON.parse(e.target.result);
        if (!Array.isArray(data)) throw new Error('格式错误');
        state.records = data.map(function (r) {
          return {
            id: r.id || uid(),
            startDate: r.startDate,
            endDate: r.endDate || '',
            flow: r.flow || '',
            symptoms: r.symptoms || [],
            notes: r.notes || '',
            createdAt: r.createdAt || Date.now()
          };
        });
        sortRecords();
        enrichRecords();
        saveRecords();
        renderAll();
        toast('已导入 ' + state.records.length + ' 条记录', 'success');
      } catch (err) {
        toast('导入失败：文件格式错误', 'error');
      }
    };
    reader.readAsText(file);
  }
  function clearAll () {
    if (state.records.length === 0) { toast('没有数据可清空', 'error'); return; }
    if (!confirm('确定清空所有经期记录吗？此操作不可恢复！')) return;
    state.records = [];
    saveRecords();
    resetForm();
    renderAll();
    toast('所有数据已清空', 'success');
  }

  // ---------- 事件绑定 ----------
  function bindEvents () {
    // 主按钮
    $('btnAdd').addEventListener('click', function () {
      resetForm();
      $('formCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(function () { $('startDate').focus(); }, 400);
    });
    $('btnSample').addEventListener('click', loadSample);
    $('btnCancel').addEventListener('click', resetForm);

    // 表单提交
    $('periodForm').addEventListener('submit', submitForm);

    // 经血量选择
    document.querySelectorAll('.flow-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        var flow = chip.getAttribute('data-flow');
        if (state.selectedFlow === flow) {
          state.selectedFlow = null;
          chip.classList.remove('active');
        } else {
          state.selectedFlow = flow;
          document.querySelectorAll('.flow-chip').forEach(function (c) { c.classList.remove('active'); });
          chip.classList.add('active');
        }
      });
    });

    // 症状选择
    document.querySelectorAll('.symptom-tag').forEach(function (tag) {
      tag.addEventListener('click', function () {
        var s = tag.getAttribute('data-symptom');
        var idx = state.selectedSymptoms.indexOf(s);
        if (idx === -1) {
          state.selectedSymptoms.push(s);
          tag.classList.add('active');
        } else {
          state.selectedSymptoms.splice(idx, 1);
          tag.classList.remove('active');
        }
      });
    });

    // 结束日期默认 = 开始日期 + 4
    $('startDate').addEventListener('change', function () {
      if (!$('endDate').value && $('startDate').value) {
        $('endDate').value = addDays($('startDate').value, 4);
      }
    });

    // 日历导航
    $('calPrev').addEventListener('click', function () {
      state.calMonth--;
      if (state.calMonth < 0) { state.calMonth = 11; state.calYear--; }
      renderCalendar();
    });
    $('calNext').addEventListener('click', function () {
      state.calMonth++;
      if (state.calMonth > 11) { state.calMonth = 0; state.calYear++; }
      renderCalendar();
    });
    $('calToday').addEventListener('click', function () {
      var now = new Date();
      state.calYear = now.getFullYear();
      state.calMonth = now.getMonth();
      renderCalendar();
    });

    // 数据管理
    $('btnExport').addEventListener('click', exportData);
    $('btnImport').addEventListener('click', function () { $('importFile').click(); });
    $('importFile').addEventListener('change', function (e) {
      if (e.target.files[0]) importData(e.target.files[0]);
      e.target.value = '';
    });
    $('btnClear').addEventListener('click', clearAll);

    // Modal close
    $('modalClose').addEventListener('click', function () { $('modalOverlay').classList.remove('show'); });
    $('modalOverlay').addEventListener('click', function (e) {
      if (e.target === $('modalOverlay')) $('modalOverlay').classList.remove('show');
    });
  }

  // ---------- 初始化 ----------
  function init () {
    loadRecords();
    sortRecords();
    enrichRecords();
    resetForm();
    bindEvents();
    renderAll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
