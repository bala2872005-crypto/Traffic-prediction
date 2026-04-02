/**
 * Charts Module - Traffic Visualization with Chart.js
 */

const ChartsModule = (() => {
    let congestionChart = null;

    // Chart.js global defaults for dark theme
    function setDefaults() {
        Chart.defaults.color = '#94a3b8';
        Chart.defaults.borderColor = 'rgba(148, 163, 184, 0.1)';
        Chart.defaults.font.family = "'Inter', sans-serif";
        Chart.defaults.font.size = 11;
    }

    /**
     * Create or update the congestion bar chart
     */
    function renderCongestionChart(predictions) {
        setDefaults();

        const ctx = document.getElementById('congestionChart');
        if (!ctx) return;

        const labels = [];
        const data = [];
        const colors = [];

        // Sort by congestion level
        const sorted = Object.entries(predictions).sort((a, b) => b[1].congestion - a[1].congestion);

        sorted.forEach(([nodeId, info]) => {
            labels.push(nodeId);
            data.push((info.congestion * 100).toFixed(1));

            if (info.congestion > 0.6) {
                colors.push('rgba(239, 68, 68, 0.8)');
            } else if (info.congestion > 0.3) {
                colors.push('rgba(245, 158, 11, 0.8)');
            } else {
                colors.push('rgba(16, 185, 129, 0.8)');
            }
        });

        if (congestionChart) {
            congestionChart.data.labels = labels;
            congestionChart.data.datasets[0].data = data;
            congestionChart.data.datasets[0].backgroundColor = colors;
            congestionChart.update();
            return;
        }

        congestionChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Congestion %',
                    data: data,
                    backgroundColor: colors,
                    borderColor: colors.map(c => c.replace('0.8', '1')),
                    borderWidth: 1,
                    borderRadius: 4,
                    borderSkipped: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(17, 24, 39, 0.95)',
                        borderColor: 'rgba(148, 163, 184, 0.2)',
                        borderWidth: 1,
                        titleFont: { weight: '600' },
                        padding: 10,
                        cornerRadius: 8,
                        callbacks: {
                            label: (ctx) => `Congestion: ${ctx.raw}%`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        grid: { color: 'rgba(148,163,184,0.06)' },
                        ticks: {
                            callback: (v) => v + '%',
                            font: { size: 10 }
                        }
                    },
                    x: {
                        grid: { display: false },
                        ticks: {
                            font: { size: 10, weight: '600', family: "'JetBrains Mono', monospace" }
                        }
                    }
                },
                animation: {
                    duration: 800,
                    easing: 'easeOutQuart'
                }
            }
        });
    }

    // Trend Chart functionality removed to clean up UI

    /**
     * Destroy charts for cleanup
     */
    function destroy() {
        if (congestionChart) { congestionChart.destroy(); congestionChart = null; }
        if (trendChart) { trendChart.destroy(); trendChart = null; }
    }

    return {
        renderCongestionChart,
        destroy
    };
})();
