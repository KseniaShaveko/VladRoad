if (window.Vue && document.getElementById("homeDecorApp")) {
    const { createApp } = Vue;

    createApp({
        components: {
            "decor-line": {
                props: {
                    d: {
                        type: String,
                        required: true
                    },
                    viewBox: {
                        type: String,
                        default: "0 0 980 360"
                    }
                },

                template: `
                    <svg
                        :viewBox="viewBox"
                        fill="none"
                        aria-hidden="true"
                        focusable="false"
                    >
                        <path
                            :d="d"
                            stroke="#31B8FF"
                            stroke-width="3"
                            stroke-linecap="round"
                            stroke-dasharray="2 12"
                        />
                    </svg>
                `
            }
        }
    }).mount("#homeDecorApp");
}