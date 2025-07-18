// グローバル変数
let allData = [];
let monthlyData = {};
let currentChart = null;
let regionalChartInstance = null;
let comparisonChartInstance = null;
let wardChartInstance = null;
let percentageChartInstance = null;
let periodComparisonChartInstance = null;

// Chart.jsのデフォルト設定
Chart.register(ChartDataLabels);
Chart.defaults.set('plugins.datalabels', {
    display: false
});

// 大阪市の区リスト
const osakaWards = [
    '北区', '都島区', '福島区', '此花区', '中央区', '西区', '港区', '大正区',
    '天王寺区', '浪速区', '西淀川区', '淀川区', '東淀川区', '東成区', '生野区',
    '旭区', '城東区', '鶴見区', '阿倍野区', '住之江区', '住吉区', '東住吉区',
    '平野区', '西成区'
];

// 大阪府内の主要都市
const osakaCities = [
    '堺市', '東大阪市', '枚方市', '豊中市', '吹田市', '高槻市', '茨木市', '八尾市',
    '寝屋川市', '岸和田市', '和泉市', '守口市', '門真市', '松原市', '大東市',
    '箕面市', '羽曳野市', '摂津市', '富田林市', '河内長野市', '池田市', '泉大津市',
    '泉佐野市', '貝塚市', '藤井寺市', '泉南市', '柏原市', '交野市', '大阪狭山市', '阪南市'
];

// ファイルアップロード処理
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');

uploadArea.addEventListener('click', () => fileInput.click());
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});
uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});
uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFile(files[0]);
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
    }
});

// ファイル処理
function handleFile(file) {
    if (!file.name.endsWith('.csv')) {
        showError('CSVファイルを選択してください');
        return;
    }
    
    // 前回のデータをクリア
    allData = [];
    monthlyData = {};
    if (currentChart) {
        currentChart.destroy();
        currentChart = null;
    }
    if (regionalChartInstance) {
        regionalChartInstance.destroy();
        regionalChartInstance = null;
    }
    if (comparisonChartInstance) {
        comparisonChartInstance.destroy();
        comparisonChartInstance = null;
    }
    if (wardChartInstance) {
        wardChartInstance.destroy();
        wardChartInstance = null;
    }
    if (percentageChartInstance) {
        percentageChartInstance.destroy();
        percentageChartInstance = null;
    }
    if (periodComparisonChartInstance) {
        periodComparisonChartInstance.destroy();
        periodComparisonChartInstance = null;
    }
    
    showLoading(true);
    
    Papa.parse(file, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: function(results) {
            if (results.errors.length > 0) {
                console.error('パースエラー:', results.errors);
            }
            processData(results.data);
        },
        error: function(error) {
            showError('ファイルの読み込みに失敗しました: ' + error.message);
            showLoading(false);
        }
    });
}

// データ処理
function processData(data) {
    try {
        allData = data;
        
        // データ分析を実行
        analyzeData();
        
        // 日付範囲を設定
        setDateRange();
        
        // 分析が完了してからUIを更新
        setTimeout(() => {
            // UIを表示
            document.getElementById('controls').style.display = 'block';
            document.getElementById('summaryCards').style.display = 'grid';
            document.getElementById('tabs').style.display = 'flex';
            document.getElementById('monthlyChart').style.display = 'block';
            document.getElementById('regionalTable').style.display = 'block';
            document.getElementById('periodComparisonControls').style.display = 'block';
            
            // データを表示
            updateDisplay();
            
            // テーブルのソート機能を追加
            setupTableSort();
            
            // 検索機能を追加
            setupSearch();
            
            showLoading(false);
        }, 100);
        
    } catch (error) {
        console.error('データ処理エラー:', error);
        showError('データの処理中にエラーが発生しました: ' + error.message);
        showLoading(false);
    }
}

// データ分析
function analyzeData() {
    monthlyData = {};
    
    // 月ごとにグループ化
    allData.forEach(row => {
        if (!row['日付'] || !row['初診・再診']) return;
        
        const date = new Date(row['日付']);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        
        if (!monthlyData[monthKey]) {
            monthlyData[monthKey] = {
                allRecords: [],
                firstVisits: [],
                maxPatientNumber: 0
            };
        }
        
        monthlyData[monthKey].allRecords.push(row);
        
        if (row['初診・再診'] === '初診') {
            monthlyData[monthKey].firstVisits.push(row);
        }
        
        if (row['患者番号'] > monthlyData[monthKey].maxPatientNumber) {
            monthlyData[monthKey].maxPatientNumber = row['患者番号'];
        }
    });
    
    // 各月の境界番号を計算（前月の最大番号 + 1）
    const sortedMonths = Object.keys(monthlyData).sort();
    let previousMax = 16; // 2023年4月の開始が17番なので、その前は16番
    
    sortedMonths.forEach(month => {
        monthlyData[month].boundary = previousMax + 1;
        previousMax = monthlyData[month].maxPatientNumber;
        
        // 純初診と再初診を分類
        const boundary = monthlyData[month].boundary;
        monthlyData[month].pureFirst = [];
        monthlyData[month].reFirst = [];
        
        // ユニーク患者で集計
        const processedPatients = new Set();
        
        monthlyData[month].firstVisits.forEach(record => {
            const patientId = record['患者番号'];
            if (!processedPatients.has(patientId)) {
                processedPatients.add(patientId);
                
                if (patientId >= boundary) {
                    monthlyData[month].pureFirst.push(record);
                } else {
                    monthlyData[month].reFirst.push(record);
                }
            }
        });
        
        // 全体の患者数を計算（ユニーク患者数）
        const uniquePatients = new Set();
        monthlyData[month].allRecords.forEach(record => {
            uniquePatients.add(record['患者番号']);
        });
        monthlyData[month].totalUniquePatients = uniquePatients.size;
        
        // 地域別集計
        monthlyData[month].regional = analyzeRegional(monthlyData[month].pureFirst, monthlyData[month].reFirst);
    });
    
    updateDisplay();
}

// 地域分析
function analyzeRegional(pureFirst, reFirst) {
    const regional = {
        pure: {},
        re: {}
    };
    
    // 大阪市各区の初期化
    osakaWards.forEach(ward => {
        regional.pure[ward] = 0;
        regional.re[ward] = 0;
    });
    
    // 大阪府内各市の初期化
    regional.pure['大阪府内その他'] = 0;
    regional.re['大阪府内その他'] = 0;
    
    // 純初診の地域別集計
    pureFirst.forEach(record => {
        const address = record['患者住所'] || '';
        const region = classifyAddress(address);
        
        if (!regional.pure[region]) {
            regional.pure[region] = 0;
        }
        regional.pure[region]++;
    });
    
    // 再初診の地域別集計
    reFirst.forEach(record => {
        const address = record['患者住所'] || '';
        const region = classifyAddress(address);
        
        if (!regional.re[region]) {
            regional.re[region] = 0;
        }
        regional.re[region]++;
    });
    
    return regional;
}

// 住所から地域を分類
function classifyAddress(address) {
    if (!address) return 'その他';
    
    // 大阪市の区を判定
    for (const ward of osakaWards) {
        if (address.includes(`大阪市${ward}`)) {
            return ward;
        }
    }
    
    // 大阪府内の市を判定
    for (const city of osakaCities) {
        if (address.includes(city)) {
            return city;
        }
    }
    
    // 他府県
    const prefectures = {
        '兵庫県': ['兵庫県', '神戸市', '尼崎市', '西宮市', '芦屋市', '伊丹市', '宝塚市'],
        '京都府': ['京都府', '京都市', '宇治市', '亀岡市'],
        '東京都': ['東京都', '千代田区', '中央区', '港区', '新宿区', '文京区', '台東区', '墨田区', '江東区', '品川区', '目黒区', '大田区', '世田谷区', '渋谷区', '中野区', '杉並区', '豊島区', '北区', '荒川区', '板橋区', '練馬区', '足立区', '葛飾区', '江戸川区'],
        '奈良県': ['奈良県', '奈良市', '大和高田市', '大和郡山市'],
        '和歌山県': ['和歌山県', '和歌山市'],
        '滋賀県': ['滋賀県', '大津市', '草津市']
    };
    
    for (const [pref, keywords] of Object.entries(prefectures)) {
        for (const keyword of keywords) {
            if (address.includes(keyword)) {
                return pref;
            }
        }
    }
    
    // 大阪府内のその他
    if (address.includes('大阪府') || address.includes('府')) {
        return '大阪府内その他';
    }
    
    return 'その他';
}

// 日付範囲を設定
function setDateRange() {
    const months = Object.keys(monthlyData).sort();
    if (months.length > 0) {
        document.getElementById('startMonth').value = months[0];
        document.getElementById('endMonth').value = months[months.length - 1];
    }
}

// 表示更新
function updateDisplay() {
    const startMonth = document.getElementById('startMonth').value;
    const endMonth = document.getElementById('endMonth').value;
    
    const filteredMonths = Object.keys(monthlyData)
        .filter(month => month >= startMonth && month <= endMonth)
        .sort();
    
    if (filteredMonths.length === 0) {
        showError('選択された期間にデータがありません');
        return;
    }
    
    // サマリーカードを更新
    updateSummaryCards(filteredMonths);
    
    // グラフを更新
    updateMonthlyChart(filteredMonths);
    
    // 地域別テーブルを更新
    updateRegionalTable(filteredMonths);
}

// サマリーカード更新（前年同月比を追加）
function updateSummaryCards(months) {
    const lastMonth = months[months.length - 1];
    const prevMonth = months.length > 1 ? months[months.length - 2] : null;
    const lastYearMonth = getLastYearMonth(lastMonth);
    
    // 表示月を更新
    const [year, mon] = lastMonth.split('-');
    document.getElementById('currentPeriodDisplay').textContent = `${year}年${parseInt(mon)}月のデータ`;
    
    const lastData = monthlyData[lastMonth];
    const pureCount = lastData.pureFirst.length;
    const reCount = lastData.reFirst.length;
    const totalCount = pureCount + reCount;
    const pureRate = totalCount > 0 ? (pureCount / totalCount * 100).toFixed(1) : 0;
    
    document.getElementById('pureFirstValue').textContent = pureCount.toLocaleString() + '人';
    document.getElementById('reFirstValue').textContent = reCount.toLocaleString() + '人';
    document.getElementById('totalFirstValue').textContent = totalCount.toLocaleString() + '人';
    document.getElementById('pureRateValue').textContent = pureRate + '%';
    
    // 前月比を計算
    if (prevMonth && monthlyData[prevMonth]) {
        const prevData = monthlyData[prevMonth];
        const prevPure = prevData.pureFirst.length;
        const prevRe = prevData.reFirst.length;
        const prevTotal = prevPure + prevRe;
        
        const [prevYear, prevMon] = prevMonth.split('-');
        const prevMonthLabel = `${prevYear}年${parseInt(prevMon)}月比`;
        
        document.getElementById('pureFirstChange').innerHTML = getChangeText(pureCount, prevPure, prevMonthLabel);
        document.getElementById('reFirstChange').innerHTML = getChangeText(reCount, prevRe, prevMonthLabel);
        document.getElementById('totalFirstChange').innerHTML = getChangeText(totalCount, prevTotal, prevMonthLabel);
    } else {
        document.getElementById('pureFirstChange').textContent = '前月データなし';
        document.getElementById('reFirstChange').textContent = '前月データなし';
        document.getElementById('totalFirstChange').textContent = '前月データなし';
    }
    
    // 前年同月比を計算
    if (monthlyData[lastYearMonth]) {
        const lastYearData = monthlyData[lastYearMonth];
        const lastYearPure = lastYearData.pureFirst.length;
        const lastYearRe = lastYearData.reFirst.length;
        const lastYearTotal = lastYearPure + lastYearRe;
        
        const [lyYear, lyMon] = lastYearMonth.split('-');
        const lastYearLabel = `${lyYear}年${parseInt(lyMon)}月比`;
        
        document.getElementById('pureFirstYearChange').innerHTML = getChangeText(pureCount, lastYearPure, lastYearLabel);
        document.getElementById('reFirstYearChange').innerHTML = getChangeText(reCount, lastYearRe, lastYearLabel);
        document.getElementById('totalFirstYearChange').innerHTML = getChangeText(totalCount, lastYearTotal, lastYearLabel);
        
        // 純初診率の前年比
        if (lastYearTotal > 0) {
            const lastYearRate = (lastYearPure / lastYearTotal * 100).toFixed(1);
            const rateChange = (parseFloat(pureRate) - parseFloat(lastYearRate)).toFixed(1);
            const changeClass = rateChange > 0 ? 'increase' : 'decrease';
            document.getElementById('pureRateChange').innerHTML = 
                `${lyYear}年${parseInt(lyMon)}月比: <span class="${changeClass}">${rateChange > 0 ? '+' : ''}${rateChange}pt</span>`;
        }
    } else {
        document.getElementById('pureFirstYearChange').textContent = '前年同月データなし';
        document.getElementById('reFirstYearChange').textContent = '前年同月データなし';
        document.getElementById('totalFirstYearChange').textContent = '前年同月データなし';
        document.getElementById('pureRateChange').textContent = '前年同月データなし';
    }
    
    // 全体に対する割合を計算
    const totalPatients = lastData.totalUniquePatients;
    const purePercentage = totalPatients > 0 ? (pureCount / totalPatients * 100).toFixed(1) : 0;
    const rePercentage = totalPatients > 0 ? (reCount / totalPatients * 100).toFixed(1) : 0;
    const totalPercentage = totalPatients > 0 ? (totalCount / totalPatients * 100).toFixed(1) : 0;
    
    document.getElementById('purePercentageValue').textContent = purePercentage + '%';
    document.getElementById('rePercentageValue').textContent = rePercentage + '%';
    document.getElementById('totalPercentageValue').textContent = totalPercentage + '%';
    
    // 全体比率の前月比
    if (prevMonth && monthlyData[prevMonth]) {
        const prevTotalPatients = monthlyData[prevMonth].totalUniquePatients;
        const prevPurePercentage = prevTotalPatients > 0 ? (monthlyData[prevMonth].pureFirst.length / prevTotalPatients * 100).toFixed(1) : 0;
        const prevRePercentage = prevTotalPatients > 0 ? (monthlyData[prevMonth].reFirst.length / prevTotalPatients * 100).toFixed(1) : 0;
        const prevTotalPercentage = prevTotalPatients > 0 ? ((monthlyData[prevMonth].pureFirst.length + monthlyData[prevMonth].reFirst.length) / prevTotalPatients * 100).toFixed(1) : 0;
        
        const purePercentageChange = (parseFloat(purePercentage) - parseFloat(prevPurePercentage)).toFixed(1);
        const rePercentageChange = (parseFloat(rePercentage) - parseFloat(prevRePercentage)).toFixed(1);
        const totalPercentageChange = (parseFloat(totalPercentage) - parseFloat(prevTotalPercentage)).toFixed(1);
        
        const [prevYear, prevMon] = prevMonth.split('-');
        
        document.getElementById('purePercentageChange').innerHTML = 
            `${prevYear}年${parseInt(prevMon)}月比: <span class="${purePercentageChange > 0 ? 'increase' : 'decrease'}">${purePercentageChange > 0 ? '+' : ''}${purePercentageChange}pt</span>`;
        document.getElementById('rePercentageChange').innerHTML = 
            `${prevYear}年${parseInt(prevMon)}月比: <span class="${rePercentageChange > 0 ? 'increase' : 'decrease'}">${rePercentageChange > 0 ? '+' : ''}${rePercentageChange}pt</span>`;
        document.getElementById('totalPercentageChange').innerHTML = 
            `${prevYear}年${parseInt(prevMon)}月比: <span class="${totalPercentageChange > 0 ? 'increase' : 'decrease'}">${totalPercentageChange > 0 ? '+' : ''}${totalPercentageChange}pt</span>`;
    } else {
        document.getElementById('purePercentageChange').textContent = '前月データなし';
        document.getElementById('rePercentageChange').textContent = '前月データなし';
        document.getElementById('totalPercentageChange').textContent = '前月データなし';
    }
}

// 月別グラフ更新（数値ラベル付き）
function updateMonthlyChart(months) {
    const ctx = document.getElementById('monthlyCanvas').getContext('2d');
    
    const labels = months.map(month => {
        const [year, mon] = month.split('-');
        return `${year}年${parseInt(mon)}月`;
    });
    
    const pureData = months.map(month => monthlyData[month].pureFirst.length);
    const reData = months.map(month => monthlyData[month].reFirst.length);
    const rateData = months.map(month => {
        const pure = monthlyData[month].pureFirst.length;
        const re = monthlyData[month].reFirst.length;
        const total = pure + re;
        return total > 0 ? (pure / total * 100).toFixed(1) : 0;
    });
    
    if (currentChart) {
        currentChart.destroy();
    }
    
    currentChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '純初診',
                    data: pureData,
                    backgroundColor: '#3498db',
                    yAxisID: 'y'
                },
                {
                    label: '再初診',
                    data: reData,
                    backgroundColor: '#2ecc71',
                    yAxisID: 'y'
                },
                {
                    label: '純初診率',
                    data: rateData,
                    type: 'line',
                    borderColor: '#e74c3c',
                    backgroundColor: 'transparent',
                    yAxisID: 'y1',
                    borderWidth: 3,
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            aspectRatio: 2,
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: '患者数（人）'
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    min: 0,
                    max: 100,
                    title: {
                        display: true,
                        text: '純初診率（%）'
                    },
                    grid: {
                        drawOnChartArea: false
                    }
                }
            },
            plugins: {
                datalabels: {
                    display: function(context) {
                        return context.dataset.type !== 'line';
                    },
                    anchor: 'end',
                    align: 'top',
                    color: '#333',
                    font: {
                        weight: 'bold',
                        size: 12
                    },
                    formatter: function(value) {
                        return value + '人';
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.dataset.label === '純初診率') {
                                label += context.parsed.y + '%';
                            } else {
                                label += context.parsed.y + '人';
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });
}

// 地域別テーブル更新（ソート機能付き）
let regionalTableData = [];
function updateRegionalTable(months) {
    const lastMonth = months[months.length - 1];
    const prevMonth = months.length > 1 ? months[months.length - 2] : null;
    
    const lastData = monthlyData[lastMonth].regional;
    
    // 全地域を集計
    const allRegions = new Set();
    Object.keys(lastData.pure).forEach(region => allRegions.add(region));
    Object.keys(lastData.re).forEach(region => allRegions.add(region));
    
    // テーブルデータを準備
    regionalTableData = [];
    allRegions.forEach(region => {
        const pure = lastData.pure[region] || 0;
        const re = lastData.re[region] || 0;
        const total = pure + re;
        
        if (total === 0) return; // データがない地域は表示しない
        
        const rate = total > 0 ? (pure / total * 100).toFixed(1) : 0;
        
        let prevChange = '-';
        let prevChangeValue = 0;
        if (prevMonth && monthlyData[prevMonth].regional) {
            const prevPure = monthlyData[prevMonth].regional.pure[region] || 0;
            const prevRe = monthlyData[prevMonth].regional.re[region] || 0;
            const prevTotal = prevPure + prevRe;
            
            if (prevTotal > 0) {
                prevChangeValue = ((total - prevTotal) / prevTotal * 100).toFixed(1);
                const changeClass = prevChangeValue > 0 ? 'increase' : 'decrease';
                prevChange = `<span class="${changeClass}">${prevChangeValue > 0 ? '+' : ''}${prevChangeValue}%</span>`;
            }
        }
        
        regionalTableData.push({
            region: region,
            pure: pure,
            re: re,
            total: total,
            rate: parseFloat(rate),
            prevChange: prevChange,
            prevChangeValue: parseFloat(prevChangeValue) || 0
        });
    });
    
    // 初期ソート（西区を最初に、その他の区、府内市町村、他府県の順）
    sortRegionalTable('region');
    renderRegionalTable();
}

// テーブルのレンダリング
function renderRegionalTable(filteredData = null) {
    const tbody = document.getElementById('regionalTableBody');
    tbody.innerHTML = '';
    
    const dataToRender = filteredData || regionalTableData;
    
    dataToRender.forEach(row => {
        const tr = `
            <tr>
                <td>${row.region}</td>
                <td>${row.pure}</td>
                <td>${row.re}</td>
                <td>${row.total}</td>
                <td>${row.rate}%</td>
                <td>${row.prevChange}</td>
            </tr>
        `;
        tbody.innerHTML += tr;
    });
}

// テーブルソート機能
function sortRegionalTable(sortBy) {
    regionalTableData.sort((a, b) => {
        // 西区を最優先
        if (a.region === '西区') return -1;
        if (b.region === '西区') return 1;
        
        switch(sortBy) {
            case 'region':
                // 地域名でソート（区→市→他府県）
                if (osakaWards.includes(a.region) && !osakaWards.includes(b.region)) return -1;
                if (!osakaWards.includes(a.region) && osakaWards.includes(b.region)) return 1;
                return a.region.localeCompare(b.region);
            case 'pure':
                return b.pure - a.pure;
            case 're':
                return b.re - a.re;
            case 'total':
                return b.total - a.total;
            case 'rate':
                return b.rate - a.rate;
            default:
                return 0;
        }
    });
}

// テーブルソートのセットアップ
function setupTableSort() {
    // ヘッダークリックでソート
    document.querySelectorAll('.sortable').forEach(th => {
        th.addEventListener('click', function() {
            const sortBy = this.getAttribute('data-sort');
            sortRegionalTable(sortBy);
            renderRegionalTable();
        });
    });
    
    // ソートセレクトボックス
    document.getElementById('sortSelect').addEventListener('change', function() {
        sortRegionalTable(this.value);
        renderRegionalTable();
    });
}

// 検索機能のセットアップ
function setupSearch() {
    document.getElementById('searchInput').addEventListener('input', function() {
        const searchTerm = this.value.toLowerCase();
        const filteredData = regionalTableData.filter(row => 
            row.region.toLowerCase().includes(searchTerm)
        );
        renderRegionalTable(filteredData);
    });
}

// タブ切り替え
function switchTab(tabName) {
    // タブのアクティブ状態を更新
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // チャートの表示切り替え
    document.getElementById('monthlyChart').style.display = 'none';
    document.getElementById('regionalChart').style.display = 'none';
    document.getElementById('comparisonChart').style.display = 'none';
    document.getElementById('wardChart').style.display = 'none';
    document.getElementById('percentageChart').style.display = 'none';
    document.getElementById('periodComparisonChart').style.display = 'none';
    
    switch(tabName) {
        case 'monthly':
            document.getElementById('monthlyChart').style.display = 'block';
            break;
        case 'regional':
            document.getElementById('regionalChart').style.display = 'block';
            updateRegionalChart();
            break;
        case 'comparison':
            document.getElementById('comparisonChart').style.display = 'block';
            updateComparisonChart();
            break;
        case 'ward':
            document.getElementById('wardChart').style.display = 'block';
            updateWardChart();
            break;
        case 'percentage':
            document.getElementById('percentageChart').style.display = 'block';
            updatePercentageChart();
            break;
        case 'periodComparison':
            document.getElementById('periodComparisonChart').style.display = 'block';
            break;
    }
}

// 地域別グラフ更新
function updateRegionalChart() {
    const startMonth = document.getElementById('startMonth').value;
    const endMonth = document.getElementById('endMonth').value;
    
    const filteredMonths = Object.keys(monthlyData)
        .filter(month => month >= startMonth && month <= endMonth)
        .sort();
    
    if (filteredMonths.length === 0) return;
    
    // 期間全体の地域別集計
    const totalRegional = {};
    
    filteredMonths.forEach(month => {
        const monthRegional = monthlyData[month].regional;
        
        Object.keys(monthRegional.pure).forEach(region => {
            if (!totalRegional[region]) {
                totalRegional[region] = { pure: 0, re: 0 };
            }
            totalRegional[region].pure += monthRegional.pure[region];
            totalRegional[region].re += monthRegional.re[region];
        });
    });
    
    // 上位地域を抽出
    const topRegions = Object.entries(totalRegional)
        .map(([region, data]) => ({
            region,
            total: data.pure + data.re,
            pure: data.pure,
            re: data.re
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 15);
    
    const ctx = document.getElementById('regionalCanvas').getContext('2d');
    
    if (regionalChartInstance) {
        regionalChartInstance.destroy();
    }
    
    regionalChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: topRegions.map(r => r.region),
            datasets: [
                {
                    label: '純初診',
                    data: topRegions.map(r => r.pure),
                    backgroundColor: '#3498db'
                },
                {
                    label: '再初診',
                    data: topRegions.map(r => r.re),
                    backgroundColor: '#2ecc71'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    stacked: true
                },
                y: {
                    stacked: true,
                    title: {
                        display: true,
                        text: '患者数（人）'
                    }
                }
            },
            plugins: {
                datalabels: {
                    display: true,
                    anchor: 'center',
                    align: 'center',
                    color: 'white',
                    font: {
                        weight: 'bold',
                        size: 10
                    },
                    formatter: function(value) {
                        return value > 0 ? value : '';
                    }
                }
            }
        }
    });
}

// 前年・前月比較グラフ
function updateComparisonChart() {
    const startMonth = document.getElementById('startMonth').value;
    const endMonth = document.getElementById('endMonth').value;
    
    const filteredMonths = Object.keys(monthlyData)
        .filter(month => month >= startMonth && month <= endMonth)
        .sort();
    
    if (filteredMonths.length === 0) return;
    
    const labels = [];
    const monthlyChange = [];
    const yearlyChange = [];
    
    filteredMonths.forEach(month => {
        const [year, mon] = month.split('-');
        labels.push(`${year}年${parseInt(mon)}月`);
        
        const currentTotal = monthlyData[month].pureFirst.length + monthlyData[month].reFirst.length;
        
        // 前月比
        const prevMonth = getPreviousMonth(month);
        if (monthlyData[prevMonth]) {
            const prevTotal = monthlyData[prevMonth].pureFirst.length + monthlyData[prevMonth].reFirst.length;
            const change = prevTotal > 0 ? ((currentTotal - prevTotal) / prevTotal * 100).toFixed(1) : 0;
            monthlyChange.push(parseFloat(change));
        } else {
            monthlyChange.push(null);
        }
        
        // 前年比
        const lastYearMonth = getLastYearMonth(month);
        if (monthlyData[lastYearMonth]) {
            const lastYearTotal = monthlyData[lastYearMonth].pureFirst.length + monthlyData[lastYearMonth].reFirst.length;
            const change = lastYearTotal > 0 ? ((currentTotal - lastYearTotal) / lastYearTotal * 100).toFixed(1) : 0;
            yearlyChange.push(parseFloat(change));
        } else {
            yearlyChange.push(null);
        }
    });
    
    const ctx = document.getElementById('comparisonCanvas').getContext('2d');
    
    if (comparisonChartInstance) {
        comparisonChartInstance.destroy();
    }
    
    comparisonChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '前月比（%）',
                    data: monthlyChange,
                    borderColor: '#3498db',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    tension: 0.1
                },
                {
                    label: '前年同月比（%）',
                    data: yearlyChange,
                    borderColor: '#e74c3c',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    title: {
                        display: true,
                        text: '変化率（%）'
                    },
                    ticks: {
                        callback: function(value) {
                            return value + '%';
                        }
                    }
                }
            },
            plugins: {
                datalabels: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += context.parsed.y.toFixed(1) + '%';
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });
}

// 大阪市区別グラフ
function updateWardChart() {
    const startMonth = document.getElementById('startMonth').value;
    const endMonth = document.getElementById('endMonth').value;
    
    const filteredMonths = Object.keys(monthlyData)
        .filter(month => month >= startMonth && month <= endMonth)
        .sort();
    
    if (filteredMonths.length === 0) return;
    
    // 主要区のみ表示（上位6区）
    const wardTotals = {};
    
    filteredMonths.forEach(month => {
        const monthRegional = monthlyData[month].regional;
        osakaWards.forEach(ward => {
            if (!wardTotals[ward]) wardTotals[ward] = 0;
            wardTotals[ward] += (monthRegional.pure[ward] || 0);
        });
    });
    
    const topWards = Object.entries(wardTotals)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 6)
        .map(([ward]) => ward);
    
    const labels = filteredMonths.map(month => {
        const [year, mon] = month.split('-');
        return `${parseInt(mon)}月`;
    });
    
    const datasets = topWards.map((ward, index) => {
        const data = filteredMonths.map(month => 
            monthlyData[month].regional.pure[ward] || 0
        );
        
        const colors = [
            '#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6', '#34495e'
        ];
        
        return {
            label: ward,
            data: data,
            borderColor: colors[index % colors.length],
            backgroundColor: 'transparent',
            borderWidth: 2,
            tension: 0.1
        };
    });
    
    const ctx = document.getElementById('wardCanvas').getContext('2d');
    
    if (wardChartInstance) {
        wardChartInstance.destroy();
    }
    
    wardChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: '純初診数（人）'
                    }
                }
            },
            plugins: {
                datalabels: {
                    display: false
                }
            }
        }
    });
}

// ユーティリティ関数
function getPreviousMonth(monthStr) {
    const [year, month] = monthStr.split('-').map(Number);
    const date = new Date(year, month - 2, 1); // month - 1 - 1
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getLastYearMonth(monthStr) {
    const [year, month] = monthStr.split('-').map(Number);
    return `${year - 1}-${String(month).padStart(2, '0')}`;
}

function getChangeText(current, previous, label) {
    if (previous === 0) return label + ': -';
    const change = ((current - previous) / previous * 100).toFixed(1);
    const sign = change > 0 ? '+' : '';
    const className = change > 0 ? 'increase' : 'decrease';
    return `${label}: <span class="${className}">${sign}${change}%</span>`;
}

function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    setTimeout(() => {
        errorDiv.style.display = 'none';
    }, 5000);
}

function showLoading(show) {
    document.getElementById('loading').style.display = show ? 'block' : 'none';
}

// 分析更新ボタン
function updateAnalysis() {
    updateDisplay();
}

// 全体比率推移グラフ
function updatePercentageChart() {
    const startMonth = document.getElementById('startMonth').value;
    const endMonth = document.getElementById('endMonth').value;
    
    const filteredMonths = Object.keys(monthlyData)
        .filter(month => month >= startMonth && month <= endMonth)
        .sort();
    
    if (filteredMonths.length === 0) return;
    
    const labels = filteredMonths.map(month => {
        const [year, mon] = month.split('-');
        return `${year}年${parseInt(mon)}月`;
    });
    
    // 各月の全体比率を計算
    const purePercentages = [];
    const rePercentages = [];
    const totalPercentages = [];
    
    filteredMonths.forEach(month => {
        const data = monthlyData[month];
        const pureCount = data.pureFirst.length;
        const reCount = data.reFirst.length;
        const totalFirst = pureCount + reCount;
        const totalPatients = data.totalUniquePatients;
        
        purePercentages.push(totalPatients > 0 ? (pureCount / totalPatients * 100).toFixed(1) : 0);
        rePercentages.push(totalPatients > 0 ? (reCount / totalPatients * 100).toFixed(1) : 0);
        totalPercentages.push(totalPatients > 0 ? (totalFirst / totalPatients * 100).toFixed(1) : 0);
    });
    
    const ctx = document.getElementById('percentageCanvas').getContext('2d');
    
    if (percentageChartInstance) {
        percentageChartInstance.destroy();
    }
    
    percentageChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '純初診の全体比率（%）',
                    data: purePercentages,
                    borderColor: '#3498db',
                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    borderWidth: 2,
                    tension: 0.1
                },
                {
                    label: '再初診の全体比率（%）',
                    data: rePercentages,
                    borderColor: '#2ecc71',
                    backgroundColor: 'rgba(46, 204, 113, 0.1)',
                    borderWidth: 2,
                    tension: 0.1
                },
                {
                    label: '初診合計の全体比率（%）',
                    data: totalPercentages,
                    borderColor: '#e74c3c',
                    backgroundColor: 'rgba(231, 76, 60, 0.1)',
                    borderWidth: 2,
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    title: {
                        display: true,
                        text: '全体に対する比率（%）'
                    },
                    ticks: {
                        callback: function(value) {
                            return value + '%';
                        }
                    }
                }
            },
            plugins: {
                datalabels: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            label += context.parsed.y + '%';
                            return label;
                        }
                    }
                }
            }
        }
    });
}
