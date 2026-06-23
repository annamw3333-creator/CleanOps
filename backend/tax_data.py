"""Canada 2026 payroll tax engine. Estimates for planning only — not official payroll/tax advice."""

TAX_YEAR = 2026

# ---- Federal 2026 ----
FED_BRACKETS = [(58523, 0.14), (117045, 0.205), (181440, 0.26), (258482, 0.29), (float("inf"), 0.33)]
FED_BPA = 16452
FED_LOWEST = 0.14

# ---- CPP / CPP2 2026 ----
CPP_EXEMPT = 3500
CPP_YMPE = 74600
CPP_RATE = 0.0595
CPP_MAX = 4230.45
CPP2_CEILING = 85000
CPP2_RATE = 0.04
CPP2_MAX = 416.00
CPP_SE_RATE = 0.1190           # self-employed base
CPP_SE_MAX = 8460.90
CPP2_SE_RATE = 0.08
CPP2_SE_MAX = 832.00

# ---- EI 2026 ----
EI_MIE = 68900
EI_RATE = 0.0163
EI_MAX = 1123.07
EI_RATE_QC = 0.0130
EI_MAX_QC = 895.70

PAY_FREQUENCIES = {"weekly": 52, "biweekly": 26, "semimonthly": 24, "monthly": 12}

# province code -> {name, brackets:[(upper,rate)], bpa, lowest}
PROVINCES = {
    "AB": {"name": "Alberta", "bpa": 22769, "brackets": [(61200, 0.08), (154259, 0.10), (185111, 0.12), (246813, 0.13), (370220, 0.14), (float("inf"), 0.15)]},
    "BC": {"name": "British Columbia", "bpa": 13216, "brackets": [(50363, 0.056), (100728, 0.077), (115648, 0.105), (140430, 0.1229), (190405, 0.147), (265545, 0.168), (float("inf"), 0.205)]},
    "MB": {"name": "Manitoba", "bpa": 15780, "brackets": [(47000, 0.108), (100200, 0.1275), (float("inf"), 0.174)]},
    "NB": {"name": "New Brunswick", "bpa": 11188, "brackets": [(52333, 0.094), (104666, 0.14), (193861, 0.16), (258482, 0.195), (float("inf"), 0.234)]},
    "NL": {"name": "Newfoundland and Labrador", "bpa": 11029, "brackets": [(44678, 0.087), (89354, 0.145), (159528, 0.158), (258482, 0.178), (float("inf"), 0.218)]},
    "NS": {"name": "Nova Scotia", "bpa": 11932, "brackets": [(30995, 0.0879), (61991, 0.1495), (97417, 0.1667), (157124, 0.175), (float("inf"), 0.21)]},
    "NT": {"name": "Northwest Territories", "bpa": 13216, "brackets": [(53003, 0.059), (106009, 0.086), (172346, 0.122), (float("inf"), 0.1405)]},
    "NU": {"name": "Nunavut", "bpa": 13216, "brackets": [(55801, 0.04), (111602, 0.07), (181439, 0.09), (float("inf"), 0.115)]},
    "ON": {"name": "Ontario", "bpa": 12989, "brackets": [(53891, 0.0505), (107785, 0.0915), (150000, 0.1116), (220000, 0.1216), (float("inf"), 0.1316)]},
    "PE": {"name": "Prince Edward Island", "bpa": 15000, "brackets": [(33928, 0.095), (64656, 0.1347), (105000, 0.166), (140000, 0.1762), (float("inf"), 0.19)]},
    "QC": {"name": "Quebec", "bpa": 15780, "brackets": [(54345, 0.14), (108680, 0.19), (132245, 0.24), (float("inf"), 0.2575)]},
    "SK": {"name": "Saskatchewan", "bpa": 20381, "brackets": [(54532, 0.105), (155805, 0.125), (float("inf"), 0.145)]},
    "YT": {"name": "Yukon", "bpa": 16452, "brackets": [(58523, 0.064), (117045, 0.09), (181440, 0.109), (500000, 0.128), (float("inf"), 0.15)]},
}


def _bracket_tax(income, brackets):
    tax, lower = 0.0, 0.0
    for upper, rate in brackets:
        if income > lower:
            tax += (min(income, upper) - lower) * rate
            lower = upper
        else:
            break
    return tax


def compute_paystub(province: str, hourly_rate: float, hours_per_week: float,
                    pay_frequency: str, worker_type: str = "employee"):
    prov = PROVINCES.get(province)
    if not prov:
        raise ValueError("Unknown province")
    periods = PAY_FREQUENCIES.get(pay_frequency, 26)
    annual_gross = round(hourly_rate * hours_per_week * 52, 2)
    is_qc = province == "QC"

    def per(v):
        return round(v / periods, 2)

    if worker_type == "employee":
        cpp1 = min(max(min(annual_gross, CPP_YMPE) - CPP_EXEMPT, 0) * CPP_RATE, CPP_MAX)
        cpp2 = min(max(min(annual_gross, CPP2_CEILING) - CPP_YMPE, 0) * CPP2_RATE, CPP2_MAX)
        ei = min(annual_gross, EI_MIE) * (EI_RATE_QC if is_qc else EI_RATE)
        ei = min(ei, EI_MAX_QC if is_qc else EI_MAX)
        credit_base = cpp1 + cpp2 + ei
        fed_tax = max(0.0, _bracket_tax(annual_gross, FED_BRACKETS) - (FED_BPA + credit_base) * FED_LOWEST)
        prov_low = prov["brackets"][0][1]
        prov_tax = max(0.0, _bracket_tax(annual_gross, prov["brackets"]) - (prov["bpa"] + credit_base) * prov_low)
        total = cpp1 + cpp2 + ei + fed_tax + prov_tax
        net = annual_gross - total
        emp_cpp = cpp1 + cpp2
        emp_ei = ei * 1.4
        return {
            "worker_type": "employee", "province": province, "province_name": prov["name"],
            "pay_frequency": pay_frequency, "periods_per_year": periods,
            "hourly_rate": hourly_rate, "hours_per_week": hours_per_week, "tax_year": TAX_YEAR,
            "annual": {"gross": round(annual_gross, 2), "cpp": round(cpp1, 2), "cpp2": round(cpp2, 2),
                       "ei": round(ei, 2), "federal_tax": round(fed_tax, 2), "provincial_tax": round(prov_tax, 2),
                       "total_deductions": round(total, 2), "net": round(net, 2),
                       "employer_cpp": round(emp_cpp, 2), "employer_ei": round(emp_ei, 2)},
            "per_period": {"gross": per(annual_gross), "cpp": per(cpp1), "cpp2": per(cpp2), "ei": per(ei),
                           "federal_tax": per(fed_tax), "provincial_tax": per(prov_tax),
                           "total_deductions": per(total), "net": per(net)},
        }
    else:
        # freelancer / subcontractor (self-employed): no EI; CPP both portions; tax set-aside estimate
        cpp_se = min(max(min(annual_gross, CPP_YMPE) - CPP_EXEMPT, 0) * CPP_SE_RATE, CPP_SE_MAX)
        cpp2_se = min(max(min(annual_gross, CPP2_CEILING) - CPP_YMPE, 0) * CPP2_SE_RATE, CPP2_SE_MAX)
        taxable = max(0.0, annual_gross - cpp_se * 0.5)  # half of CPP is deductible
        fed_tax = max(0.0, _bracket_tax(taxable, FED_BRACKETS) - FED_BPA * FED_LOWEST)
        prov_low = prov["brackets"][0][1]
        prov_tax = max(0.0, _bracket_tax(taxable, prov["brackets"]) - prov["bpa"] * prov_low)
        set_aside = cpp_se + cpp2_se + fed_tax + prov_tax
        net = annual_gross - set_aside
        gst_note = annual_gross > 30000
        return {
            "worker_type": worker_type, "province": province, "province_name": prov["name"],
            "pay_frequency": pay_frequency, "periods_per_year": periods,
            "hourly_rate": hourly_rate, "hours_per_week": hours_per_week, "tax_year": TAX_YEAR,
            "gst_registration_required": gst_note,
            "annual": {"gross": round(annual_gross, 2), "cpp_self": round(cpp_se + cpp2_se, 2),
                       "federal_tax": round(fed_tax, 2), "provincial_tax": round(prov_tax, 2),
                       "total_set_aside": round(set_aside, 2), "net_after_set_aside": round(net, 2)},
            "per_period": {"gross": per(annual_gross), "set_aside": per(set_aside), "net": per(net)},
        }
