using System;
using System.Text;
using System.Collections.Generic;

public class Program
{
  public static void Main(string[] args)
  {
  }
}

public class Solution {
    public string LicenseKeyFormatting(string s, int k) 
    {
        List<string> sb = new List<string>();
        s = s.Remove('-');
        int len = s.Length;
        int firstElemLength = len % 4;
        int repeatBy = len / 4;
        sb.Add(s.Substring(0,4));
        for (int i = 0; i < repeatBy; i++)
        {
            sb.Add(s.Substring(repeatBy * 4 + firstElemLength, 4));
        }
        return string.Join('-', sb);

    }
}