"""Streamlit dashboard — uses streamlit run, different port."""

import streamlit as st
import pandas as pd

st.set_page_config(page_title="Silo Dashboard", layout="wide")

st.title("Sample Dashboard")
st.write("Built with Streamlit on Silo.")

# Sample data
data = pd.DataFrame({
    "Month": ["Jan", "Feb", "Mar", "Apr", "May"],
    "Revenue": [100, 150, 130, 170, 200],
    "Users": [50, 65, 80, 95, 120],
})

col1, col2 = st.columns(2)

with col1:
    st.subheader("Revenue")
    st.bar_chart(data.set_index("Month")["Revenue"])

with col2:
    st.subheader("Users")
    st.line_chart(data.set_index("Month")["Users"])

st.dataframe(data)
