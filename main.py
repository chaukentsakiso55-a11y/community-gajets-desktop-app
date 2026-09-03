import tkinter as tk
from tkinter import ttk

APP_NAME = "Community Gadget Desktop"

class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title(APP_NAME)
        self.geometry("1100x700")
        self.minsize(800, 520)
        self.configure(bg="#050816")
        style = ttk.Style(self)
        style.theme_use("clam")
        style.configure("TButton", padding=12, font=("Segoe UI", 11))
        frame = tk.Frame(self, bg="#081326", highlightbackground="#2ee8ff", highlightthickness=1)
        frame.pack(fill="both", expand=True, padx=36, pady=36)
        tk.Label(frame, text="CYBER PULSE", fg="#55e7ff", bg="#081326", font=("Segoe UI", 11, "bold")).pack(anchor="w", padx=36, pady=(34, 6))
        tk.Label(frame, text=APP_NAME, fg="white", bg="#081326", font=("Segoe UI", 34, "bold")).pack(anchor="w", padx=36)
        tk.Label(frame, text="Desktop foundation ready. Product modules are being integrated.", fg="#a9bfd9", bg="#081326", font=("Segoe UI", 13)).pack(anchor="w", padx=36, pady=(12, 28))
        ttk.Button(frame, text="Open dashboard", command=self.dashboard).pack(anchor="w", padx=36)
        self.status = tk.Label(frame, text="System ready", fg="#61f7c4", bg="#081326", font=("Segoe UI", 11))
        self.status.pack(anchor="w", padx=36, pady=22)

    def dashboard(self):
        self.status.config(text="Dashboard initialized")

if __name__ == "__main__":
    App().mainloop()
